import { LIMIT, plan } from './public/contract.mjs';

export async function stub(prompt, {mode}) {
  if (mode === 'simulate-failure') throw new Error('Simulated provider failure.');
  const rules = [
    ['billing', /\b(?:charged|invoice|refund|payment)\b/i],
    ['account', /\b(?:password|login|log in|sign in|locked)\b/i],
    ['technical', /\b(?:crash(?:es)?|error|broken|bug)\b/i]
  ];
  return rules.find(([, pattern]) => pattern.test(prompt))?.[0] ?? 'other';
}
class BoundaryError extends Error {}
async function callModel(provider, prompt, config, remaining) {
  const controller = new AbortController();
  const budget = Math.min(LIMIT.callMs, remaining);
  const end = performance.now() + budget;
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new BoundaryError('Model call timed out.'));
      }, budget);
    });
    const result = await Promise.race([timeout, provider(prompt,config,controller.signal)]);
    if (performance.now() >= end) throw new BoundaryError('Model call timed out.');
    if (typeof result !== 'string' || !result.trim() || result.length > LIMIT.output) throw new BoundaryError('Invalid model output.');
    return result;
  } finally {
    clearTimeout(timer);
  }
}
export async function execute(workflow, provider = stub) {
  const deadline = performance.now() + LIMIT.runMs;
  const nodes = plan(workflow);
  const steps = nodes.map(({id,type}) => ({id,type,state:'skipped'}));
  let value, calls = 0;
  for (const [i,node] of nodes.entries()) {
    try {
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new BoundaryError('Run deadline exceeded.');
      switch (node.type) {
        case 'input': value = node.config.text; break;
        case 'prompt':
          value = node.config.template.replace('{{input}}', () => value);
          if (value.length > LIMIT.prompt) throw new BoundaryError('Rendered prompt is too large.');
          break;
        case 'model':
          if (++calls > LIMIT.calls) throw new BoundaryError('Model-call limit exceeded.');
          value = await callModel(provider,value,node.config,remaining);
          break;
        case 'output': break;
      }
      steps[i].state = 'succeeded';
      steps[i].text = value;
    } catch (err) {
      steps[i].state = 'failed';
      steps[i].error = err instanceof BoundaryError ? err.message : 'Stub provider failed.';
      return {status:'failed',provider:'local-stub',calls,steps,output:null};
    }
  }
  return {status:'succeeded',provider:'local-stub',calls,steps,output:value};
}
