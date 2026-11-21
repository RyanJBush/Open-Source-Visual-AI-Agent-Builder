import { LIMIT, plan, providerSpec, render } from './public/contract.mjs';
import { createOllama, InvalidReply, ProviderError } from './ollama.mjs';

export async function stub(prompt, {mode}) {
  if (mode === 'simulate-failure') throw new Error('Simulated provider failure.');
  const rules = [
    ['billing', /\b(?:charged|invoice|refund|payment)\b/i],
    ['account', /\b(?:password|login|log in|sign in|locked)\b/i],
    ['technical', /\b(?:crash(?:es)?|error|broken|bug)\b/i]
  ];
  return rules.find(([, pattern]) => pattern.test(prompt))?.[0] ?? 'other';
}
// Adapters keyed by the workflow's validated provider name. admit() returns a refusal message
// (disabled, misconfigured, budget used up) and is checked before any slot or call is consumed.
const adapters = { 'local-stub': {call: stub}, 'ollama': createOllama() };
class BoundaryError extends Error {}
// Process-wide count of provider calls whose promise has not settled. A timed-out run returns
// while a provider that ignores its abort signal keeps working, so the slot is released only
// when the provider's own promise settles. A provider that never settles keeps the slot, and
// later runs fail closed instead of stacking abandoned calls.
let inFlight = 0;
async function callModel(provider, prompt, config, budget) {
  const controller = new AbortController();
  const end = performance.now() + budget;
  let timer, released = false;
  inFlight++;
  const release = () => { if (!released) { released = true; inFlight--; } };
  try {
    let pending;
    try { pending = Promise.resolve(provider(prompt,config,controller.signal)); }
    catch (err) { release(); throw err; }
    pending.then(release, release);
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new BoundaryError('Model call timed out.'));
      }, budget);
    });
    const result = await Promise.race([timeout, pending]);
    if (performance.now() >= end) throw new BoundaryError('Model call timed out.');
    if (typeof result !== 'string' || !result.trim() || result.length > LIMIT.output) throw new BoundaryError('Invalid model output.');
    return result;
  } finally {
    clearTimeout(timer);
  }
}
// provider: omitted to use the adapter named by the workflow, a function (prompt, config, signal)
// for tests, or an adapter object {call, admit?}.
export async function execute(workflow, provider) {
  const start = performance.now();
  const nodes = plan(workflow);
  const model = nodes.find(n => n.type === 'model').config;
  const spec = providerSpec(model.provider);
  const adapter = typeof provider === 'function' ? {call: provider} : provider ?? adapters[model.provider];
  const deadline = start + spec.runMs;
  const steps = nodes.map(({id,type}) => ({id,type,state:'skipped'}));
  let value, calls = 0;
  for (const [i,node] of nodes.entries()) {
    try {
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new BoundaryError('Run deadline exceeded.');
      switch (node.type) {
        case 'input': value = node.config.text; break;
        case 'prompt':
          value = render(node.config.template, value);
          if (value.length > LIMIT.prompt) throw new BoundaryError('Rendered prompt is too large.');
          break;
        case 'model': {
          if (calls >= LIMIT.calls) throw new BoundaryError('Model-call limit exceeded.');
          const refusal = adapter.admit?.();
          if (refusal) throw new ProviderError(refusal);
          // No await between this check and callModel's increment, so concurrent runs cannot both pass it.
          if (inFlight >= LIMIT.inFlight) throw new BoundaryError('Another model call is still running. Try again shortly.');
          calls++;
          value = await callModel(adapter.call,value,node.config,Math.min(spec.callMs,remaining));
          break;
        }
        case 'output': break;
      }
      steps[i].state = 'succeeded';
      steps[i].text = value;
    } catch (err) {
      steps[i].state = 'failed';
      if (err instanceof InvalidReply) steps[i].errorCode = 'invalid-response';
      steps[i].error = err instanceof BoundaryError || err instanceof ProviderError ? err.message : spec.name + ' provider failed.';
      return {status:'failed',provider:model.provider,calls,steps,output:null};
    }
  }
  return {status:'succeeded',provider:model.provider,calls,steps,output:value};
}
