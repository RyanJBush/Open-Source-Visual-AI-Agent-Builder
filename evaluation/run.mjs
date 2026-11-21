import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execute} from '../engine.mjs';
import {LABELS} from '../public/contract.mjs';
import {outcome,summarize} from './score.mjs';

const split = process.argv[2];
if (!['dev','heldout'].includes(split) || process.argv.length !== 3) throw new Error('Usage: node evaluation/run.mjs dev|heldout');
if (process.env.RELAY_ENABLE_OLLAMA !== '1') throw new Error('Set RELAY_ENABLE_OLLAMA=1 to run the local comparison.');
if (process.env.RELAY_OLLAMA_URL && process.env.RELAY_OLLAMA_URL !== 'http://127.0.0.1:11434')
  throw new Error('This benchmark uses the default local Ollama origin.');
const inputs = {};
function read(path) {
  const bytes = readFileSync(new URL('../'+path,import.meta.url));
  inputs[path] = createHash('sha256').update(bytes).digest('hex');
  return bytes.toString('utf8');
}
for (const file of ['engine.mjs','ollama.mjs','public/contract.mjs','evaluation/run.mjs','evaluation/score.mjs']) read(file);
const cases = JSON.parse(read('evaluation/'+split+'.json'));
const key = JSON.parse(read('evaluation/'+split+'-key.json'));
if (!cases.length || new Set(cases.map(c=>c.id)).size !== cases.length || Object.keys(key).length !== cases.length ||
    cases.some(c => typeof c.request !== 'string' || !LABELS.includes(key[c.id]))) throw new Error('Invalid dataset or key.');
const workflows = ['examples/support.json','examples/support-ollama.json'].map(path => JSON.parse(read(path)));
const template = w => w.nodes.find(n => n.type === 'prompt').config.template;
if (template(workflows[0]) !== template(workflows[1])) throw new Error('Provider templates differ.');
let model = {name:'qwen3:4b',digest:null,ollamaVersion:null};
try {
  const get = async path => (await fetch('http://127.0.0.1:11434'+path,{signal:AbortSignal.timeout(2000)})).json();
  model.ollamaVersion = (await get('/api/version')).version;
  model.digest = (await get('/api/tags')).models.find(m => m.name === model.name)?.digest ?? null;
} catch { /* Keep unavailable model attempts in the denominator. */ }
const rows = [];
for (const {id,request} of cases) {
  for (const base of workflows) {
    const w = structuredClone(base);
    w.nodes.find(n => n.type === 'input').config.text = request;
    const start = performance.now();
    const result = await execute(w);
    const elapsedMs = Number((performance.now()-start).toFixed(3));
    const failed = result.steps.find(s => s.state === 'failed');
    rows.push({id,provider:result.provider,expected:key[id],predicted:result.output,
      outcome:outcome(result),calls:result.calls,elapsedMs,error:failed?.error ?? null});
  }
}
const summary = Object.fromEntries(['local-stub','ollama'].map(p => [p,summarize(rows.filter(row=>row.provider===p))]));
console.log(JSON.stringify({split,synthetic:true,node:process.version,platform:process.platform,model,
  cost:{externalApiCalls:0,measuredDollars:null},inputs,summary,rows},null,2));
if (rows.some(row=>row.outcome === 'failure')) process.exitCode = 1;
