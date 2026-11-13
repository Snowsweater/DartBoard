import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, stat, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Install Playwright (or playwright-core), then set PLAYWRIGHT_MODULE if it is
// outside node_modules. CHROMIUM_PATH can point to an existing Chromium binary.
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright-core';
const {chromium} = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, process.env.BROWSER_TEST_OUTPUT || 'work');
await mkdir(output, {recursive:true});
const report = {startedAt:new Date().toISOString(), browser:'Chromium', tests:[], consoleErrors:[], pageErrors:[], notes:[
  'Camera success uses Chromium synthetic video; no physical camera quality or real darts coaching accuracy is asserted.',
  'No-device and denied-permission cases exercise native browser responses.',
  'Optional web fonts are replaced with an empty stylesheet so the tests are local and repeatable.'
]};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.task':'application/octet-stream','.json':'application/json','.png':'image/png','.mp4':'video/mp4'};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    let requested=path.resolve(root, '.'+decodeURIComponent(url.pathname));
    if(requested!==root&&!requested.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if((await stat(requested)).isDirectory())requested=path.join(requested,'index.html');
    const content=await readFile(requested);
    res.writeHead(200,{'Content-Type':mime[path.extname(requested)]||'application/octet-stream','Cache-Control':'no-store'}).end(content);
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base=`http://127.0.0.1:${server.address().port}`;
const launchOptions={headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--deny-permission-prompts']};
let normalBrowser, fakeBrowser, deniedBrowser;

async function context(browser, options={}){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',acceptDownloads:true,...options});
  await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.addInitScript(()=>{
    window.__testCamera={streams:[],errors:[],constraints:[]};
    if(navigator.mediaDevices?.getUserMedia){
      const real=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=async constraints=>{
        window.__testCamera.constraints.push(constraints);
        try{const stream=await real(constraints);window.__testCamera.streams.push(stream);return stream;}
        catch(error){window.__testCamera.errors.push(error.name);throw error;}
      };
    }
  });
  ctx.on('page',page=>{
    page.setDefaultTimeout(12000);
    page.on('pageerror',error=>report.pageErrors.push({url:page.url(),message:error.message}));
    page.on('console',message=>{if(message.type()==='error'){const value=message.text();if(/^INFO: Created TensorFlow Lite XNNPACK delegate for CPU\.$/.test(value)){report.notes.push('MediaPipe initialized XNNPACK CPU inference.');return;}report.consoleErrors.push({url:page.url(),message:value});}});
  });
  return ctx;
}
async function text(page,selector){return (await page.locator(selector).innerText()).trim();}
async function waitText(page,selector,expected){await page.waitForFunction(({selector,expected})=>document.querySelector(selector)?.textContent.includes(expected),{selector,expected});}
async function navigate(page,view){await page.locator(`[data-nav="${view}"]`).click();await page.waitForFunction(view=>document.querySelector(`[data-nav="${view}"]`)?.getAttribute('aria-current')==='page',view);}
async function saved(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('dartboard.training.v1')));}
async function screenshot(page,name){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true});}
async function run(name,fn){const start=Date.now();try{const evidence=await fn();report.tests.push({name,status:'passed',durationMs:Date.now()-start,evidence});console.log(`PASS ${name}`);}catch(error){const blocked=name.includes('file://')&&error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR');report.tests.push({name,status:blocked?'blocked':'failed',durationMs:Date.now()-start,error:error.stack});console.error(`${blocked?'BLOCKED':'FAIL'} ${name}: ${error.message}`);}}
async function coreSmoke(page,url){
  await page.goto(url);await page.locator('#hero-start').waitFor();
  assert.match(await text(page,'.sample-pill'),/SAMPLE/);
  await page.locator('#hero-start').click();await page.locator('#begin-session').click();
  await page.locator('[data-multiplier="T"]').click();await page.locator('[data-number="20"]').click();
  await page.locator('[data-multiplier="S"]').click();await page.locator('[data-number="20"]').click();
  await page.locator('[data-hit="MISS"]').click();
  assert.deepEqual((await saved(page)).active.throws.map(t=>t.segment),['T20','S20','MISS']);
  assert.match(await text(page,'.live-stats'),/80\.0/);
  await page.locator('#undo-throw').click();
  assert.deepEqual((await saved(page)).active.throws.map(t=>t.segment),['T20','S20']);
  await page.reload();await waitText(page,'.big-remaining','2');
  assert.deepEqual((await saved(page)).active.throws.map(t=>t.segment),['T20','S20']);
  assert.match(await text(page,'.live-stats'),/120\.0/);
  assert.match(await text(page,'.live-stats'),/50\.0%/);
  await page.locator('#finish-session').click();await page.locator('#modal[open]').waitFor();
  const record=(await saved(page)).sessions[0];assert.equal(record.throws.length,2);assert.equal(record.target,'T20');
  await page.locator('#result-sessions').click();await page.locator('[data-session]').waitFor();
  assert.equal(await page.locator('[data-session]').count(),1);
  const downloadEvent=page.waitForEvent('download');await page.locator('#export-sessions').click();const download=await downloadEvent;
  const csv=await readFile(await download.path(),'utf8');
  assert.match(csv,/Hit rate \(%\)/);assert.match(csv,/"T20 accuracy"/);assert.match(csv,/"50\.0","120\.0"/);
  return {savedDarts:2,accuracyPercent:50,threeDartAverage:120,csvFilename:download.suggestedFilename()};
}

try {
  normalBrowser=await chromium.launch(launchOptions);
  deniedBrowser=await chromium.launch({...launchOptions,args:[...launchOptions.args,'--use-fake-device-for-media-stream']});
  fakeBrowser=await chromium.launch({...launchOptions,args:[...launchOptions.args.filter(x=>x!=='--deny-permission-prompts'),'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  await run('Accuracy logging, undo, reload persistence, saving and CSV export',async()=>{
    const ctx=await context(normalBrowser);try{const page=await ctx.newPage();const result=await coreSmoke(page,base+'/dist/');await screenshot(page,'browser-sessions');return result;}finally{await ctx.close();}
  });
  await run('Checkout routes, bogey setup and invalid-score guard',async()=>{
    const ctx=await context(normalBrowser);try{const page=await ctx.newPage();await page.goto(base+'/dist/#checkout');await page.locator('#checkout-score').waitFor();
      assert.deepEqual(await page.locator('.route-dart strong').allTextContents(),['T20','T11','D14']);
      await page.locator('[data-score="170"]').click();assert.deepEqual(await page.locator('.route-dart strong').allTextContents(),['T20','T20','Bull']);
      await page.locator('#checkout-score').fill('169');await page.locator('#find-route').click();assert.match(await text(page,'.route-message'),/No double-out finish/);assert.match(await text(page,'.checkout-layout'),/Setup visit/);
      await page.locator('#checkout-score').fill('1');await page.locator('#find-route').click();await waitText(page,'#toast','whole score from 2 to 1001');
      assert.match(await text(page,'.route-message'),/No double-out finish/);
      await page.locator('#checkout-score').fill('32');await page.locator('#find-route').click();assert.deepEqual(await page.locator('.route-dart strong').allTextContents(),['D16']);
      await screenshot(page,'browser-checkout');return {routes:[121,170,32],bogey:169,invalidInput:1};
    }finally{await ctx.close();}
  });
  await run('Double-out bust resets full visit and checks out from 32',async()=>{
    const ctx=await context(normalBrowser);try{const page=await ctx.newPage();await page.goto(base+'/dist/#checkout');await page.locator('[data-score="32"]').click();await page.locator('#practice-checkout').click();await page.locator('[data-number="16"]').waitFor();
      await page.locator('[data-number="16"]').click();assert.equal((await saved(page)).active.remaining,16);
      await page.locator('[data-number="16"]').click();await waitText(page,'#toast','Bust');assert.equal((await saved(page)).active.remaining,32);assert.equal((await saved(page)).active.dartInVisit,0);
      await page.locator('[data-multiplier="D"]').click();await page.locator('[data-number="16"]').click();await page.locator('#modal[open]').waitFor();
      assert.match(await text(page,'#modal'),/That’s a checkout/);assert.match(await text(page,'.result-stats'),/24\.0/);
      const record=(await saved(page)).sessions[0];assert.equal(record.remaining,0);assert.equal(record.complete,true);assert.equal(record.throws.length,3);assert.equal(record.throws[1].bust,true);assert.equal((await saved(page)).active,null);
      return {visitResetTo:32,actualDarts:3,averageDarts:4,average:24,checkout:'D16'};
    }finally{await ctx.close();}
  });
  await run('Mobile navigation and layout stay within the viewport',async()=>{
    const ctx=await context(normalBrowser,{viewport:{width:390,height:844},isMobile:true,hasTouch:true});try{const page=await ctx.newPage();await page.goto(base+'/dist/');await page.locator('#mobile-menu').waitFor();const widths=[];
      for(const view of ['overview','practice','checkout','coach','sessions']){
        if(view!=='overview'){await page.locator('#mobile-menu').click();await navigate(page,view);}
        const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));widths.push({view,...size});assert.ok(size.document<=size.viewport+1,`${view} overflows horizontally: ${JSON.stringify(size)}`);
        assert.equal(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),false);
      }
      await screenshot(page,'browser-mobile');return widths;
    }finally{await ctx.close();}
  });
  await run('Camera permission rejection offers video fallback',async()=>{
    const ctx=await context(deniedBrowser);try{const page=await ctx.newPage();await page.goto(base+'/dist/#coach');await page.locator('[data-camera]').click();await waitText(page,'.coach-status','not granted');
      assert.equal(await page.locator('[data-camera]').isEnabled(),true);assert.equal(await text(page,'[data-camera]'),'Start camera');const errors=await page.evaluate(()=>window.__testCamera.errors);assert.deepEqual(errors,['NotAllowedError']);return {nativeError:errors[0]};
    }finally{await ctx.close();}
  });
  await run('No camera hardware offers video fallback',async()=>{
    const ctx=await context(normalBrowser,{permissions:['camera']});try{const page=await ctx.newPage();await page.goto(base+'/dist/#coach');await page.locator('[data-camera]').click();await waitText(page,'.coach-status','No camera was found');
      const errors=await page.evaluate(()=>window.__testCamera.errors);assert.deepEqual(errors,['NotFoundError']);assert.equal(await page.locator('[data-camera]').isEnabled(),true);return {nativeError:errors[0]};
    }finally{await ctx.close();}
  });
  await run('Synthetic camera starts, freezes, stops and releases on navigation',async()=>{
    const ctx=await context(fakeBrowser,{permissions:['camera']});try{const page=await ctx.newPage();await page.goto(base+'/dist/#coach');await page.locator('[data-camera]').click();await waitText(page,'.coach-status','Camera is live');
      await page.waitForFunction(()=>document.querySelector('[data-video="you"]').videoWidth>0);
      assert.equal(await page.evaluate(()=>window.__testCamera.streams[0].getVideoTracks()[0].readyState),'live');
      await page.locator('[data-freeze]').click();await waitText(page,'.coach-status','Frame captured');
      assert.equal(await page.locator('[data-still="you"]').isVisible(),true);assert.equal(await page.evaluate(()=>window.__testCamera.streams[0].getVideoTracks()[0].readyState),'ended');
      assert.ok(await page.locator('[data-still="you"]').getAttribute('src'));
      await screenshot(page,'browser-camera-freeze');
      await page.locator('[data-camera]').click();await waitText(page,'.coach-status','Camera is live');await page.locator('[data-camera]').click();await waitText(page,'.coach-status','Camera stopped');
      assert.equal(await page.evaluate(()=>window.__testCamera.streams[1].getVideoTracks()[0].readyState),'ended');
      await page.locator('[data-camera]').click();await waitText(page,'.coach-status','Camera is live');await navigate(page,'overview');
      const states=await page.evaluate(()=>window.__testCamera.streams.flatMap(s=>s.getTracks().map(t=>t.readyState)));assert.deepEqual(states,['ended','ended','ended']);
      const constraints=await page.evaluate(()=>window.__testCamera.constraints);assert.ok(constraints.every(c=>c.audio===false));return {streams:states.length,states,audioRequested:false,source:'Chromium synthetic camera'};
    }finally{await ctx.close();}
  });
  const localFile=path.join(root,'local.html');
  if(existsSync(localFile)){
    await run('Standalone localhost camera and local pose model reject a nonhuman frame',async()=>{
      const ctx=await context(fakeBrowser,{permissions:['camera']});try{
        const page=await ctx.newPage(), assets=[];
        page.on('response',response=>{if(/vision_bundle|vision_wasm|pose_landmarker/.test(response.url()))assets.push({path:new URL(response.url()).pathname,status:response.status()});});
        await page.goto(base+'/local.html#coach');await page.locator('[data-camera]').click();await waitText(page,'.coach-status','Camera is live');
        await page.waitForFunction(()=>document.querySelector('[data-video="you"]').videoWidth>0);
        await page.locator('[data-freeze]').click();await waitText(page,'.coach-status','Frame captured');
        assert.equal(await page.evaluate(()=>window.__testCamera.streams[0].getVideoTracks()[0].readyState),'ended');
        await page.locator('[data-detect="you"]').click();
        await page.waitForFunction(()=>document.querySelector('.coach-status')?.textContent.includes('not visible with enough confidence'),{},{timeout:90000});
        assert.ok(assets.some(x=>x.path.endsWith('/vision_bundle.mjs')&&x.status===200));
        assert.ok(assets.some(x=>x.path.endsWith('.wasm')&&x.status===200));
        assert.ok(assets.some(x=>x.path.endsWith('/pose_landmarker_lite.task')&&x.status===200));
        assert.ok(assets.every(x=>x.status===200));
        assert.equal(await text(page,'[data-angle-you]'),'—');
        await screenshot(page,'browser-local-camera-model');
        await page.locator('[data-camera]').click();await waitText(page,'.coach-status','Camera is live');await navigate(page,'overview');
        assert.deepEqual(await page.evaluate(()=>window.__testCamera.streams.map(s=>s.getVideoTracks()[0].readyState)),['ended','ended']);
        return {source:'Chromium synthetic camera',model:'MediaPipe Pose Landmarker Lite',result:'No confident throwing arm detected',assets,allTracksStopped:true};
      }finally{await ctx.close();}
    });
    for(const [name,url] of [['Standalone local HTML on localhost',base+'/local.html'],['Standalone local HTML through file://',pathToFileURL(localFile).href]]){
      await run(name,async()=>{const ctx=await context(normalBrowser);try{return await coreSmoke(await ctx.newPage(),url);}finally{await ctx.close();}});
    }
  }else report.notes.push('local.html did not exist during this run; its checks will run automatically once generated.');
  await run('No uncaught browser JavaScript or console errors',async()=>{assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);return {pageErrors:0,consoleErrors:0};});
}finally{
  await normalBrowser?.close();await fakeBrowser?.close();await deniedBrowser?.close();await new Promise(resolve=>server.close(resolve));
  report.completedAt=new Date().toISOString();report.passed=report.tests.filter(t=>t.status==='passed').length;report.failed=report.tests.filter(t=>t.status==='failed').length;report.blocked=report.tests.filter(t=>t.status==='blocked').length;
  await writeFile(path.join(output,'browser-smoke-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`Browser checks: ${report.passed} passed, ${report.failed} failed, ${report.blocked} blocked by environment.`);
}
if(report.failed)process.exitCode=1;
