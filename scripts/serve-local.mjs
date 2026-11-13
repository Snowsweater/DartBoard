import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {realpath, stat} from 'node:fs/promises';
import {dirname, extname, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildLocal} from './build-local.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.wasm':'application/wasm',
  '.task':'application/octet-stream', '.svg':'image/svg+xml', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.mp4':'video/mp4', '.webm':'video/webm', '.csv':'text/csv; charset=utf-8',
  '.txt':'text/plain; charset=utf-8'
};

function allowedPath(file, root) {
  if (relative(root, file).split(sep).some(part => part.startsWith('.'))) return false;
  return file === resolve(root, 'local.html') || ['dist','docs/showcase'].some(folder => file.startsWith(resolve(root, folder)+sep));
}

function rangeFor(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !size) return null;
  let start, end;
  if (!match[1]) {
    const length = Number(match[2]);
    if (!Number.isSafeInteger(length) || length < 1) return null;
    start = Math.max(0, size-length); end = size-1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size-1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
    end = Math.min(end, size-1);
  }
  return {start,end};
}

export function createLocalServer({root=projectRoot}={}) {
  root = resolve(root);
  return createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('Referrer-Policy','no-referrer');
    const reject = (code, message) => {res.writeHead(code, {'Content-Type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?'':message+'\n');};
    if (!['GET','HEAD'].includes(req.method)) {res.setHeader('Allow','GET, HEAD');reject(405,'Method not allowed');return;}
    let pathname;
    try {pathname = decodeURIComponent((req.url||'/').split('?')[0]);} catch {reject(400,'Invalid URL');return;}
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part==='..' || part.startsWith('.'))) {reject(403,'Path not available');return;}
    if (pathname==='/') {res.writeHead(302,{Location:'/local.html'});res.end();return;}
    const file = resolve(root, '.'+pathname);
    if (!allowedPath(file,root)) {reject(403,'Path not available');return;}
    let info, actual;
    try {actual=await realpath(file);info=await stat(actual);} catch {reject(404,'File not found');return;}
    if (!allowedPath(actual,root) || !info.isFile()) {reject(403,'Path not available');return;}
    res.setHeader('Content-Type',types[extname(actual).toLowerCase()]||'application/octet-stream');
    res.setHeader('Accept-Ranges','bytes');
    let range;
    if (req.headers.range) {
      range = rangeFor(req.headers.range, info.size);
      if (!range) {res.setHeader('Content-Range',`bytes */${info.size}`);reject(416,'Range not satisfiable');return;}
      res.setHeader('Content-Range',`bytes ${range.start}-${range.end}/${info.size}`);
    }
    res.setHeader('Content-Length',range?range.end-range.start+1:info.size);
    res.writeHead(range?206:200);
    if (req.method==='HEAD') {res.end();return;}
    const stream=createReadStream(actual,range);
    stream.on('error',()=>res.destroy());
    res.on('close',()=>stream.destroy());
    stream.pipe(res);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildLocal();
  const port=Number(process.env.PORT||4173);
  if (!Number.isInteger(port)||port<1||port>65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const server=createLocalServer();
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Choose another port with PORT=4174 npm start.`:error.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`DartBoard is ready: http://localhost:${port}/local.html\nPress Ctrl+C to stop. No external hosting is required.`));
}
