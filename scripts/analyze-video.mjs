import {pathToFileURL} from 'node:url';
const moduleName=process.env.PLAYWRIGHT_MODULE||'playwright-core';
const {chromium}=await import(moduleName.startsWith('/')?pathToFileURL(moduleName).href:moduleName);
import {createLocalServer} from './serve-local.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const server=createLocalServer();
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
page.on('pageerror',e=>console.error('PAGEERROR',e.message));
page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text().slice(0,200));});
try{
 await page.goto(base+'/dist/index.html#coach');
 await page.locator('[data-upload="you"]').setInputFiles(path.join(root,'docs/showcase/training-clip.mp4'));
 await page.waitForFunction(()=>document.querySelector('[data-video="you"]').readyState>=2);
 const result=await page.evaluate(async()=>{
   const {FilesetResolver,PoseLandmarker}=await import('/dist/assets/vision_bundle.mjs');
   const files=await FilesetResolver.forVisionTasks('/dist/assets/wasm');
   const model=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'/dist/assets/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'IMAGE',numPoses:1});
   const v=document.querySelector('[data-video="you"]'); const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d');
   const rows=[];
   for(let frame=0;frame<Math.floor(v.duration*10);frame++){
     const t=frame/10;await new Promise(resolve=>{if(Math.abs(v.currentTime-t)<.001){resolve();return;}v.addEventListener('seeked',resolve,{once:true});v.currentTime=t;});
     ctx.drawImage(v,0,0);const result=model.detect(c);const lm=result.landmarks?.[0];
     const arms={};for(const [side,indices]of Object.entries({right:[12,14,16],left:[11,13,15]})){
       const p=indices.map(i=>lm?.[i]);const accepted=p.every(a=>a&&(a.visibility??0)>=.6&&a.x>=0&&a.x<=1&&a.y>=0&&a.y<=1);
       let angle=null;if(accepted){const [s,e,w]=p.map(a=>({x:a.x*c.width,y:a.y*c.height}));const a={x:s.x-e.x,y:s.y-e.y},b={x:w.x-e.x,y:w.y-e.y};const den=Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);angle=den?Math.round(Math.acos(Math.max(-1,Math.min(1,(a.x*b.x+a.y*b.y)/den)))*180/Math.PI):null;}
       arms[side]={accepted,angle,minVisibility:lm?Math.min(...p.map(a=>a?.visibility??0)):0,points:p.map(a=>a?{x:a.x,y:a.y,visibility:a.visibility}:null)};
     }
     rows.push({time:t,...arms});
   }
   model.close();return{duration:v.duration,width:c.width,height:c.height,samplingHz:10,mode:'IMAGE',delegate:'CPU',model:'Pose Landmarker Lite float16 v1',sdk:'0.10.22-rc.20250304',rows};
 });
 await fs.writeFile(path.join(root,'docs/showcase/analysis.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({duration:result.duration,frames:result.rows.length,rightAccepted:result.rows.filter(r=>r.right.accepted).length,leftAccepted:result.rows.filter(r=>r.left.accepted).length,action:result.rows.filter(r=>r.time>=6.5&&r.time<=11.5).map(r=>({t:r.time,right:r.right.angle,rv:+r.right.minVisibility.toFixed(2),left:r.left.angle,lv:+r.left.minVisibility.toFixed(2)}))}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
