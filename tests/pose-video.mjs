import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createLocalServer} from '../scripts/serve-local.mjs';
import {buildLocal} from '../scripts/build-local.mjs';

const moduleName=process.env.PLAYWRIGHT_MODULE||'playwright-core';
const {chromium}=await import(moduleName.startsWith('/')?pathToFileURL(moduleName).href:moduleName);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=join(root,'docs/showcase');
await mkdir(output,{recursive:true});await buildLocal();
const server=createLocalServer();await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>requests.push(r.url()));
const evidence=[];
try {
  await page.goto('http://127.0.0.1:'+server.address().port+'/local.html#coach');
  await page.locator('[data-upload="you"]').setInputFiles(join(output,'training-clip.mp4'));
  await page.waitForFunction(()=>document.querySelector('[data-video="you"]').readyState>=2);
  await page.locator('[data-arm]').selectOption('right');
  for(const [time,expected] of [[7.5,90],[7.7,78],[8.8,null],[9.4,131],[10.8,171]]){
    await page.evaluate(async time=>{
      const v=document.querySelector('[data-video="you"]'),scrub=document.querySelector('[data-scrub="you"]');
      await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});scrub.value=time;scrub.dispatchEvent(new Event('input',{bubbles:true}));});
    },time);
    await page.locator('[data-detect="you"]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-detect="you"]').disabled&&document.querySelector('[data-detect="you"]').textContent==='Detect pose',null,{timeout:120000});
    const angle=await page.locator('[data-angle-you]').innerText(),status=await page.locator('.coach-status').innerText();
    if(expected===null){assert.equal(angle,'—');assert.match(status,/not visible with enough confidence/);}
    else {assert.match(status,/Pose estimated on your device/);assert.ok(Math.abs(parseInt(angle)-expected)<=2,'Unexpected angle '+angle+' at '+time);}
    evidence.push({time,angle,status});
    await page.locator('[data-panel="you"]').screenshot({path:join(output,'frame-'+String(time).replace('.','-')+'.png')});
    if(time===10.8)await page.screenshot({path:join(output,'local-coach.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  assert.ok(requests.some(r=>r.includes('vision_bundle.mjs')));
  assert.ok(requests.some(r=>r.includes('.wasm')));
  assert.ok(requests.some(r=>r.includes('pose_landmarker_lite.task')));
  const external=requests.filter(r=>!r.startsWith('http://127.0.0.1:')&&!r.startsWith('blob:')&&!r.startsWith('data:'));
  assert.deepEqual(external,[]);
  await writeFile(join(output,'ui-verification.json'),JSON.stringify({browser:browser.version(),source:'local.html',evidence,pageErrors:errors,externalRequests:external},null,2));
  console.log(JSON.stringify({source:'local.html',frames:evidence.map(({time,angle})=>({time,angle})),pageErrors:errors,externalRequests:external}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
