import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {execute} from './engine.mjs';
import {Invalid, LIMIT, parseWorkflow} from './public/contract.mjs';

const assets = new Map();
for (const [path,file,mime] of [
  ['/','public/index.html','text/html'],['/style.css','public/style.css','text/css'],
  ['/app.mjs','public/app.mjs','text/javascript'],['/contract.mjs','public/contract.mjs','text/javascript'],
  ['/example.json','examples/support.json','application/json']
]) assets.set(path,{body:await readFile(new URL(file,import.meta.url)),mime});

class HttpError extends Error {
  constructor(code,message) { super(message); this.code = code; }
}
function readBody(req) {
  return new Promise((resolve,reject) => {
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => finish(new HttpError(408,'Request body timed out.')),LIMIT.bodyMs);
    function finish(error) {
      clearTimeout(timer);
      req.off('data',data).off('end',end).off('error',errorEvent).off('aborted',aborted);
      if (error) { req.pause(); reject(error); }
      else resolve(Buffer.concat(chunks));
    }
    function data(chunk) {
      size += chunk.length;
      if (size > LIMIT.bytes) finish(new HttpError(413,'Workflow exceeds the 32 KiB limit.'));
      else chunks.push(chunk);
    }
    function end() { finish(); }
    function errorEvent() { finish(new HttpError(400,'Request interrupted.')); }
    function aborted() { errorEvent(); }
    req.on('data',data).once('end',end).once('error',errorEvent).once('aborted',aborted);
  });
}
export async function handle(req,res) {
  const send = (status,body,mime = 'application/json') => {
    res.writeHead(status,{
      'content-type':mime + '; charset=utf-8','cache-control':'no-store','connection':'close',
      'x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    });
    res.end(body);
  };
  try {
    const host = '127.0.0.1:' + req.socket.localPort;
    if (req.headers.host !== host || (req.headers.origin !== undefined && req.headers.origin !== 'http://' + host))
      throw new HttpError(403,'Open the editor on its loopback address.');
    if (req.method === 'GET' && assets.has(req.url)) {
      const {body,mime} = assets.get(req.url);
      return send(200,body,mime);
    }
    if (req.url !== '/api/run') throw new HttpError(404,'Unknown route.');
    if (req.method !== 'POST') throw new HttpError(405,'POST required.');
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')
      throw new HttpError(415,'Use application/json.');
    if (Number(req.headers['content-length']) > LIMIT.bytes) throw new HttpError(413,'Workflow exceeds the 32 KiB limit.');
    const bytes = await readBody(req);
    let raw;
    try { raw = new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
    catch { throw new HttpError(400,'Use UTF-8 JSON.'); }
    const workflow = parseWorkflow(raw);
    send(200,JSON.stringify(await execute(workflow)));
  } catch (err) {
    const code = err instanceof HttpError ? err.code : err instanceof Invalid ? 422 : 500;
    send(code,JSON.stringify({error:code === 500 ? 'Internal execution error.' : err.message}));
  }
}
export function listen(port = 4316) {
  const server = http.createServer({requestTimeout:6000,headersTimeout:3000,connectionsCheckingInterval:1000,maxHeaderSize:8192},handle);
  server.maxConnections = 16;
  return server.listen(port,'127.0.0.1');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = listen();
  server.on('listening',() => console.log('Relay editor at http://127.0.0.1:4316'));
  server.on('error',err => { console.error('Cannot start editor:',err.code); process.exitCode = 1; });
}
