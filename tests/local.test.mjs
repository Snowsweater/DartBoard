import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {spawnSync} from 'node:child_process';
import {buildLocal} from '../scripts/build-local.mjs';
import {createLocalServer} from '../scripts/serve-local.mjs';

const built=await buildLocal();
const html=await readFile(built.path,'utf8');
assert.ok(!html.includes('fonts.googleapis.com'));
assert.ok(!/<script[^>]+src=/.test(html));
assert.ok(html.includes('new URL("./dist/coach.js", import.meta.url)'));
assert.ok(html.includes('Local file mode.'));
assert.ok(html.includes('Direct-file support depends on your browser.'));
const script=/<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:script,encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr);

const root=await mkdtemp(join(tmpdir(),'dartboard-local-test-'));
await mkdir(join(root,'dist/assets'),{recursive:true});
await mkdir(join(root,'docs/showcase'),{recursive:true});
await writeFile(join(root,'local.html'),'<title>Local test</title>');
await writeFile(join(root,'dist/assets/pose.wasm'),Buffer.from([0,97,115,109]));
await writeFile(join(root,'dist/assets/model.task'),'model');
await writeFile(join(root,'dist/assets/runtime.mjs'),'export const loaded = true;');
await writeFile(join(root,'docs/showcase/clip.mp4'),'0123456789');
await writeFile(join(root,'private.txt'),'not public');
await symlink(join(root,'private.txt'),join(root,'dist/assets/escape.txt'));
await writeFile(join(root,'dist/.private'),'hidden file');
await mkdir(join(root,'dist/.hidden'));
await writeFile(join(root,'dist/.hidden/private.txt'),'hidden directory');
await symlink(join(root,'dist/.private'),join(root,'dist/assets/hidden-file.txt'));
await symlink(join(root,'dist/.hidden'),join(root,'dist/assets/hidden-directory'));
await symlink(join(root,'dist/assets/model.task'),join(root,'dist/assets/model-alias.task'));
const server=createLocalServer({root});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const port=server.address().port;
const get=(path,{method='GET',headers={}}={})=>new Promise((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port,path,method,headers},res=>{
    const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
  });req.on('error',reject);req.end();
});
try {
  assert.equal((await get('/')).headers.location,'/local.html');
  assert.equal((await get('/local.html')).status,200);
  assert.equal((await get('/dist/assets/pose.wasm')).headers['content-type'],'application/wasm');
  assert.equal((await get('/dist/assets/model.task')).headers['content-type'],'application/octet-stream');
  assert.match((await get('/dist/assets/runtime.mjs')).headers['content-type'],/^text\/javascript/);
  for(const path of ['/../private.txt','/dist/%2e%2e/private.txt','/.git/config','/dist/assets/escape.txt','/dist/assets/hidden-file.txt','/dist/assets/hidden-directory/private.txt','/dist-other/file.txt','/private.txt']) assert.equal((await get(path)).status,403,path);
  assert.equal((await get('/dist/assets/model-alias.task')).status,200);
  assert.equal((await get('/%ZZ')).status,400);
  assert.equal((await get('/local.html',{method:'POST'})).status,405);
  const partial=await get('/docs/showcase/clip.mp4',{headers:{Range:'bytes=2-5'}});
  assert.equal(partial.status,206);assert.equal(partial.body,'2345');assert.equal(partial.headers['content-range'],'bytes 2-5/10');
  assert.equal((await get('/docs/showcase/clip.mp4',{headers:{Range:'bytes=-3'}})).body,'789');
  assert.equal((await get('/docs/showcase/clip.mp4',{headers:{Range:'bytes=20-30'}})).status,416);
  const head=await get('/docs/showcase/clip.mp4',{method:'HEAD'});assert.equal(head.body,'');assert.equal(head.headers['content-length'],'10');
  console.log('Local HTML bundle, MIME types, range requests, and path restrictions passed.');
} finally {
  await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});
}
