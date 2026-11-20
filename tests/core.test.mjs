import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {execute} from '../engine.mjs';
import {Invalid, LIMIT, parseWorkflow} from '../public/contract.mjs';
const fixture = () => JSON.parse(readFileSync(new URL('../examples/support.json',import.meta.url)));
const link = (from,to) => ({from,to});
const invalid = {
  'unknown version': w => w.version = 2,
  'wrong version type': w => w.version = '1',
  'unknown root field': w => w.apiKey = 'fixture',
  'unknown type': w => w.nodes[0].type = 'tool',
  'credential-like ID': w => w.nodes[0].id = 'sk-'+'x'.repeat(22),
  'duplicate ID': w => w.nodes[2].id = 'ticket',
  'duplicate type': w => w.nodes[1] = {...w.nodes[0],id:'duplicate'},
  'missing node': w => w.nodes.pop(),
  'null node': w => w.nodes[0] = null,
  'dangling edge': w => w.edges[2].to = 'absent',
  'missing edge': w => w.edges.pop(),
  'duplicate edge': w => w.edges[2] = w.edges[0],
  'branch': w => w.edges[2] = link('ticket','label'),
  'merge': w => w.edges[2] = link('classify','format'),
  'reachable cycle': w => w.edges[2] = link('classify','ticket'),
  'disconnected cycle': w => w.edges = [link('ticket','label'),link('format','classify'),link('classify','format')],
  'reversed order': w => w.edges = [link('ticket','classify'),link('classify','format'),link('format','label')],
  'extra edges': w => w.edges.push(link('label','ticket')),
  'empty input': w => w.nodes[0].config.text = ' ',
  'overlong input': w => w.nodes[0].config.text = 'x'.repeat(LIMIT.input+1),
  'overlong template': w => w.nodes[1].config.template = 'x'.repeat(LIMIT.template)+'{{input}}',
  'unknown placeholder': w => w.nodes[1].config.template = '{{input}} {{env}}',
  'missing placeholder': w => w.nodes[1].config.template = 'literal',
  'repeated placeholder': w => w.nodes[1].config.template = '{{input}}{{input}}',
  'arbitrary provider': w => w.nodes[2].config.provider = 'http://example.invalid',
  'arbitrary model': w => w.nodes[2].config.model = 'remote',
  'invalid mode': w => w.nodes[2].config.mode = 'repeat',
  'tool config': w => w.nodes[2].config.tools = [],
  'credential field': w => w.nodes[2].config.api_key = 'synthetic',
  'credential expression': w => w.nodes[0].config.text = 'api_key=synthetic',
  // Each half passes the per-field screen; the rendered prompt the provider would receive does not.
  'split sk- key across template and input': w => { w.nodes[1].config.template = 'Key: sk-{{input}}'; w.nodes[0].config.text = 'proj-'+'A'.repeat(24); },
  'split GitHub token': w => { w.nodes[1].config.template = 'Token gh{{input}}'; w.nodes[0].config.text = 'p_'+'A'.repeat(28); },
  'split AWS key ID': w => { w.nodes[1].config.template = 'id AK{{input}}'; w.nodes[0].config.text = 'IAABCDEFGHIJKLMNOP'; },
  'split bearer header': w => { w.nodes[1].config.template = 'Authorization: Bear{{input}}'; w.nodes[0].config.text = 'er abc.def.ghi'; },
  'split password expression': w => { w.nodes[1].config.template = 'pass{{input}}'; w.nodes[0].config.text = 'word: hunter2'; },
  'non-finite coordinate': w => w.nodes[1].position.x = Infinity,
  'extra position member': w => w.nodes[1].position.url = 'synthetic'
};
for (const [name,mutate] of Object.entries(invalid)) {
  test(name+' rejected before provider invocation', async () => {
    const w = fixture(); mutate(w); let calls = 0;
    await assert.rejects(execute(w,async () => { calls++; return 'billing'; }),Invalid);
    assert.equal(calls,0);
  });
}
test('valid synthetic workflow has one call and four ordered successes',async () => {
  const r = await execute(fixture());
  assert.equal(r.output,'billing'); assert.equal(r.calls,1); assert.equal(r.provider,'local-stub');
  assert.deepEqual(r.steps.map(s => [s.id,s.state]),['ticket','format','classify','label'].map(id => [id,'succeeded']));
});
test('edges determine execution across reversed records and arbitrary IDs',async () => {
  const w = fixture(); const ids = new Map(w.nodes.map((n,i) => [n.id,'n'+(8-i)]));
  for (const n of w.nodes) n.id = ids.get(n.id);
  for (const e of w.edges) { e.from = ids.get(e.from); e.to = ids.get(e.to); }
  const expected = await execute(w);
  w.nodes.reverse(); w.edges.reverse();
  assert.deepEqual(await execute(w),expected);
});
test('positions and omitted presentation fields have no effect',async () => {
  const w = fixture(), expected = await execute(w);
  delete w.nodes[0].position;
  w.nodes[2].position = {x:2400,y:0};
  assert.deepEqual(await execute(w),expected);
});
test('serialized configuration round-trips including literal replacement syntax',async () => {
  const w = fixture();
  w.nodes[0].config.text = '$& $$ {{input}} <b>login</b>';
  const r = await execute(parseWorkflow(JSON.stringify(w)));
  assert.deepEqual(r,await execute(w)); assert.equal(r.output,'account');
  assert.ok(r.steps[1].text.endsWith(w.nodes[0].config.text));
});
test('malformed and oversized JSON rejected',() => {
  for (const raw of ['[', ' '.repeat(LIMIT.bytes+1)]) assert.throws(() => parseWorkflow(raw),Invalid);
});
test('max-sized input and template execute',async () => {
  const w = fixture();
  w.nodes[0].config.text = 'r'.repeat(LIMIT.input);
  w.nodes[1].config.template = 't'.repeat(LIMIT.template-9)+'{{input}}';
  assert.equal((await execute(w)).status,'succeeded');
});
const failures = {
  'provider exception': () => { throw new Error('private provider diagnostic'); },
  'oversized response': () => 'a'.repeat(LIMIT.output+1),
  'blank response': () => ' ',
  'non-text response': () => ({value:1})
};
for (const [name,provider] of Object.entries(failures)) {
  test(name+' fails Model and skips Output',async () => {
    const r = await execute(fixture(),provider);
    assert.equal(r.calls,1); assert.equal(r.output,null);
    assert.deepEqual(r.steps.map(s => s.state),['succeeded','succeeded','failed','skipped']);
    assert.doesNotMatch(JSON.stringify(r),/private provider diagnostic/);
  });
}
test('split credential is rejected by the shared validator the editor uses',() => {
  const w = fixture(); w.nodes[1].config.template = 'Key: sk-{{input}}'; w.nodes[0].config.text = 'proj-'+'A'.repeat(24);
  assert.throws(() => parseWorkflow(JSON.stringify(w)),/Rendered prompt contains credential-like text/);
});
// A provider that ignores its abort signal and settles late. A never-settling one would hold the
// in-flight slot for the rest of this process by design, so tests use a finite delay.
const ignoresAbort = (ms,log) => (_p,_c,s) => { log.signal = s; log.invoked = (log.invoked ?? 0) + 1; return new Promise(res => setTimeout(() => { log.settled = true; res('billing'); },ms)); };
test('timed-out call is cancelled, and later runs fail closed until the abandoned call settles',async () => {
  const log = {};
  const first = await execute(fixture(),ignoresAbort(LIMIT.callMs+300,log));
  assert.equal(log.signal.aborted,true); assert.match(first.steps[2].error,/timed out/); assert.equal(first.steps[3].state,'skipped');
  assert.equal(log.settled,undefined,'abandoned call is still running');
  let invoked = 0;
  const blocked = await execute(fixture(),async () => { invoked++; return 'billing'; });
  assert.equal(invoked,0); assert.equal(blocked.calls,0); assert.equal(blocked.status,'failed');
  assert.match(blocked.steps[2].error,/still running/); assert.equal(blocked.steps[3].state,'skipped');
  await new Promise(res => setTimeout(res,400));
  assert.equal(log.settled,true);
  assert.equal((await execute(fixture())).status,'succeeded','slot released after the provider settles');
});
test('concurrent runs never have more than one provider call in flight',async () => {
  const log = {};
  const runs = await Promise.all(Array.from({length:5},() => execute(fixture(),ignoresAbort(LIMIT.callMs+200,log))));
  assert.equal(log.invoked,1);
  assert.deepEqual(runs.map(r => r.calls).sort(),[0,0,0,0,1]);
  assert.equal(runs.filter(r => /still running/.test(r.steps[2].error)).length,4);
  await new Promise(res => setTimeout(res,300));
  assert.equal((await execute(fixture())).status,'succeeded');
});
test('synchronously throwing provider releases its in-flight slot',async () => {
  for (let i = 0; i < 3; i++) assert.equal((await execute(fixture(),() => { throw new Error('sync'); })).steps[2].error,'Stub provider failed.');
  assert.equal((await execute(fixture())).status,'succeeded');
});
test('actual CLI result equals executor result',async () => {
  const p = spawnSync(process.execPath,['cli.mjs','examples/support.json'],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr); assert.deepEqual(JSON.parse(p.stdout),await execute(fixture()));
});
