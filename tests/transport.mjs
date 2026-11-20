import {Readable} from 'node:stream';
import {handle} from '../server.mjs';

// Exercise the application's complete request handler without opening a TCP socket.
export async function dispatch(method,path,headers={},body=[],port=4316) {
  const req = Readable.from(body.map(chunk => Buffer.from(chunk)));
  return dispatchStream(req,method,path,headers,port);
}
export async function dispatchStream(req,method,path,headers,port=4316) {
  Object.assign(req,{method,url:path,headers:{host:'127.0.0.1:'+port,...headers},socket:{localPort:port}});
  let status, responseHeaders, bytes;
  await handle(req,{
    writeHead(code,h) { status = code; responseHeaders = h; },
    end(data) { bytes = Buffer.from(data); }
  });
  return {status,headers:responseHeaders,body:bytes};
}
