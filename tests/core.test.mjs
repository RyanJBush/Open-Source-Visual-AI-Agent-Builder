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
test('never-resolving provider receives cancellation and a bounded result',async () => {
  let signal; const r = await execute(fixture(),(_p,_c,s) => { signal = s; return new Promise(() => {}); });
  assert.equal(signal.aborted,true); assert.match(r.steps[2].error,/timed out/); assert.equal(r.steps[3].state,'skipped');
});
test('actual CLI result equals executor result',async () => {
  const p = spawnSync(process.execPath,['cli.mjs','examples/support.json'],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr); assert.deepEqual(JSON.parse(p.stdout),await execute(fixture()));
});
