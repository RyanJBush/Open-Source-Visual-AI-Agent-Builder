// Offline tests for the Ollama adapter. A fake fetch stands in for the server; no sockets are opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execute} from '../engine.mjs';
import {createOllama} from '../ollama.mjs';
import {Invalid, LABELS} from '../public/contract.mjs';

const workflow = () => JSON.parse(readFileSync(new URL('../examples/support-ollama.json',import.meta.url)));
const enabled = extra => ({RELAY_ENABLE_OLLAMA:'1',...extra});
const reply = (content,status = 200) => new Response(JSON.stringify({message:{role:'assistant',content}}),{status});
function fake(respond = () => reply('"billing"')) {
  const log = [];
  const fetchImpl = async (url,init) => { log.push({url,init,body:JSON.parse(init.body)}); return respond(url,init); };
  return {log,fetchImpl};
}

test('disabled by default: Model fails with zero calls and no request',async () => {
  const f = fake();
  const r = await execute(workflow(),createOllama({env:{},fetchImpl:f.fetchImpl}));
  assert.equal(f.log.length,0); assert.equal(r.calls,0); assert.equal(r.provider,'ollama');
  assert.deepEqual(r.steps.map(s => s.state),['succeeded','succeeded','failed','skipped']);
  assert.match(r.steps[2].error,/RELAY_ENABLE_OLLAMA=1/);
});
test('enabled adapter sends one bounded, constrained request to the loopback chat API',async () => {
  const f = fake();
  const r = await execute(workflow(),createOllama({env:enabled(),fetchImpl:f.fetchImpl}));
  assert.equal(r.status,'succeeded'); assert.equal(r.output,'billing'); assert.equal(r.calls,1); assert.equal(r.provider,'ollama');
  assert.equal(f.log.length,1);
  const {url,init,body} = f.log[0];
  assert.equal(url,'http://127.0.0.1:11434/api/chat'); assert.equal(init.redirect,'error'); assert.ok(init.signal instanceof AbortSignal);
  assert.equal(body.model,'qwen3:4b'); assert.equal(body.stream,false); assert.equal(body.think,false);
  assert.deepEqual(body.format,{type:'string',enum:[...LABELS]}); assert.equal(body.options.temperature,0);
  assert.equal(body.messages.at(-1).content,r.steps[1].text,'user message is exactly the screened rendered prompt');
});
for (const [name,url] of [['remote host','http://example.invalid:11434'],['https scheme','https://127.0.0.1:11434'],['credentials in URL','http://u:p@127.0.0.1:11434'],['path prefix','http://127.0.0.1:11434/proxy'],['not a URL','::']]) {
  test('non-loopback or unusual RELAY_OLLAMA_URL is refused before any request: '+name,async () => {
    const f = fake();
    const r = await execute(workflow(),createOllama({env:enabled({RELAY_OLLAMA_URL:url}),fetchImpl:f.fetchImpl}));
    assert.equal(f.log.length,0); assert.equal(r.calls,0); assert.match(r.steps[2].error,/RELAY_OLLAMA_URL/);
  });
}
test('localhost and IPv6 loopback origins are accepted',async () => {
  for (const origin of ['http://localhost:11434','http://[::1]:11434']) {
    const f = fake();
    assert.equal((await execute(workflow(),createOllama({env:enabled({RELAY_OLLAMA_URL:origin}),fetchImpl:f.fetchImpl}))).status,'succeeded');
    assert.equal(f.log[0].url,origin+'/api/chat');
  }
});
test('per-process call budget refuses further calls without a request',async () => {
  const f = fake(), adapter = createOllama({env:enabled({RELAY_OLLAMA_MAX_CALLS:'2'}),fetchImpl:f.fetchImpl});
  const results = [];
  for (let i = 0; i < 3; i++) results.push(await execute(workflow(),adapter));
  assert.deepEqual(results.map(r => r.status),['succeeded','succeeded','failed']);
  assert.equal(f.log.length,2); assert.equal(results[2].calls,0); assert.match(results[2].steps[2].error,/budget/);
});
test('invalid budget setting is refused',async () => {
  const f = fake();
  const r = await execute(workflow(),createOllama({env:enabled({RELAY_OLLAMA_MAX_CALLS:'lots'}),fetchImpl:f.fetchImpl}));
  assert.equal(f.log.length,0); assert.match(r.steps[2].error,/MAX_CALLS/);
});
const failures = {
  'unreachable server': [() => { throw new TypeError('fetch failed'); },/not reachable at 127\.0\.0\.1:11434/],
  'model not pulled': [() => reply('',404),/ollama pull qwen3:4b/],
  'server error': [() => reply('',500),/HTTP 500/],
  'unrecognized label': [() => reply('"refunds"'),/unrecognized label/],
  'unconstrained text': [() => reply('We are given a support request'),/unreadable/],
  'malformed body': [() => new Response('<html>'),/unreadable/],
  'oversized body': [() => new Response('x'.repeat(70000)),/too large/]
};
for (const [name,[respond,pattern]] of Object.entries(failures)) {
  test(name+' fails Model with a specific message and skips Output',async () => {
    const r = await execute(workflow(),createOllama({env:enabled(),fetchImpl:fake(respond).fetchImpl}));
    assert.equal(r.calls,1); assert.equal(r.output,null); assert.match(r.steps[2].error,pattern);
    assert.deepEqual(r.steps.map(s => s.state),['succeeded','succeeded','failed','skipped']);
  });
}
test('abort propagates as cancellation, not as a provider message',async () => {
  const controller = new AbortController();
  const adapter = createOllama({env:enabled(),fetchImpl:(_u,init) => new Promise((_,reject) => init.signal.addEventListener('abort',() => reject(new DOMException('aborted','AbortError'))))});
  const pending = adapter.call('x',{model:'qwen3:4b'},controller.signal);
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
});
test('workflow cannot select an unlisted model, a stub-only mode or a prototype key as provider',async () => {
  for (const mutate of [c => c.model = 'qwen3-coder:latest', c => c.mode = 'simulate-failure', c => c.provider = 'toString', c => c.provider = '__proto__']) {
    const w = workflow(); mutate(w.nodes.find(n => n.type === 'model').config); let calls = 0;
    await assert.rejects(execute(w,async () => { calls++; return 'billing'; }),Invalid);
    assert.equal(calls,0);
  }
});

test('stream limit stops the reader on the first byte over 64 KiB', async () => {
  let pulls = 0, cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array(pulls === 1 ? 65536 : 1));
    },
    cancel() { cancelled = true; }
  }, {highWaterMark:0});
  const adapter = createOllama({env:enabled(),fetchImpl:async () => new Response(stream)});
  const r = await execute(workflow(),adapter);
  assert.equal(pulls,2);
  assert.equal(cancelled,true);
  assert.match(r.steps[2].error,/too large/);
  assert.equal(r.steps[3].state,'skipped');
});

test('an explicitly empty Ollama origin is a configuration error',async () => {
  const f = fake();
  const r = await execute(workflow(),createOllama({env:enabled({RELAY_OLLAMA_URL:''}),fetchImpl:f.fetchImpl}));
  assert.equal(f.log.length,0);
  assert.equal(r.calls,0);
  assert.match(r.steps[2].error,/RELAY_OLLAMA_URL/);
});
test('the Ollama message content must be a string before its label is decoded',async () => {
  const f = fake(() => reply(['"billing"']));
  const r = await execute(workflow(),createOllama({env:enabled(),fetchImpl:f.fetchImpl}));
  assert.equal(r.status,'failed');
  assert.equal(r.steps[2].errorCode,'invalid-response');
  assert.equal(r.steps[3].state,'skipped');
  assert.equal(r.output,null);
});
