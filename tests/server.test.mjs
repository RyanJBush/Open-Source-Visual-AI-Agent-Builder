import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PassThrough} from 'node:stream';
import {LIMIT} from '../public/contract.mjs';
import {dispatch,dispatchStream} from './transport.mjs';
const headers = {'content-type':'application/json'};
const fixture = readFileSync('examples/support.json','utf8');
test('HTTP handler returns the ordered stub trace',async () => {
  const res = await dispatch('POST','/api/run',headers,[fixture]);
  assert.equal(res.status,200); assert.equal(JSON.parse(res.body).output,'billing');
});
for (const [name,method,path,head,body,code] of [
  ['cross-origin','POST','/api/run',{...headers,origin:'https://example.invalid'},[fixture],403],
  ['invalid Host','GET','/',{host:'example.invalid'},[],403],
  ['null origin','POST','/api/run',{...headers,origin:'null'},[],403],
  ['unknown asset','GET','/engine.mjs',{},[],404],
  ['wrong method','GET','/api/run',{},[],405],
  ['wrong media type','POST','/api/run',{},[fixture],415],
  ['large declared body','POST','/api/run',{...headers,'content-length':String(LIMIT.bytes+1)},[],413],
  ['large streamed body','POST','/api/run',headers,[' '.repeat(LIMIT.bytes),'x'],413],
  ['bad UTF-8','POST','/api/run',headers,[Buffer.from([0xff])],400],
  ['invalid graph','POST','/api/run',headers,['{}'],422]
]) test(name,async () => assert.equal((await dispatch(method,path,head,body)).status,code));
test('slow incomplete body expires',async () => {
  const stream = new PassThrough();
  const pending = dispatchStream(stream,'POST','/api/run',headers);
  stream.write('{');
  assert.equal((await pending).status,408); stream.destroy();
});
