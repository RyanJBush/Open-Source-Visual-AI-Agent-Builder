export const TYPES = ['input', 'prompt', 'model', 'output'];
export const LIMIT = Object.freeze({ bytes: 32768, input: 2048, template: 1024, prompt: 3072, output: 128, runMs: 2000, callMs: 750, calls: 1, inFlight: 1, bodyMs: 3000 });
export const LABEL = { input: 'Input', prompt: 'Prompt Template', model: 'Model', output: 'Output' };
export class Invalid extends Error {}
function requireThat(condition, message) {
  if (!condition) throw new Invalid(message);
}
function record(value, keys, label) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), label + ' must be an object.');
  requireThat(Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value,k)), label + ' fields must be exactly ' + (keys.join(', ') || '(empty)') + '.');
}
const idPattern = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const credentialPattern = /(?:-----BEGIN [^-\n]*PRIVATE KEY-----|\bBearer\s+\S+|\b(?:api[_ -]?key|password|access[_ -]?token|secret)\s*[:=]\s*\S+|\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}))/i;
function credentialFree(value, label) {
  requireThat(!credentialPattern.test(value), label + ' contains credential-like text. Use synthetic data.');
}
function textField(value, max, label) {
  requireThat(typeof value === 'string' && value.trim() && value.length <= max, label + ' requires 1–' + max + ' characters.');
  credentialFree(value, label);
}
// The exact text the provider receives. Shared by plan() and the executor so both screen the same string.
export function render(template, input) {
  return template.replace('{{input}}', () => input);
}
function inspectNode(n) {
  record(n, Object.hasOwn(n ?? {},'position') ? ['id','type','config','position'] : ['id','type','config'], 'Node');
  requireThat(typeof n.id === 'string' && idPattern.test(n.id), 'Invalid node ID.');
  textField(n.id,40,'Node ID');
  requireThat(TYPES.includes(n.type), 'Unknown node type.');
  if (Object.hasOwn(n,'position')) {
    record(n.position,['x','y'],'Position');
    requireThat(Object.values(n.position).every(v => Number.isFinite(v) && v >= 0 && v <= 2400), 'Coordinates must be between 0 and 2400.');
  }
  const c = n.config;
  switch (n.type) {
    case 'input':
      record(c,['text'],'Input configuration');
      textField(c.text,LIMIT.input,'Input');
      break;
    case 'prompt':
      record(c,['template'],'Template configuration');
      textField(c.template,LIMIT.template,'Template');
      requireThat(c.template.split('{{input}}').length === 2 && !/[{}]/.test(c.template.replace('{{input}}','')), 'Use {{input}} exactly once. Other braces or placeholders are unsupported.');
      break;
    case 'model':
      record(c,['provider','model','mode'],'Model configuration');
      requireThat(c.provider === 'local-stub' && c.model === 'support-v1', 'Only local-stub / support-v1 is available.');
      requireThat(['classify','simulate-failure'].includes(c.mode),'Unknown stub mode.');
      break;
    case 'output': record(c,[],'Output configuration');
  }
}
export function plan(workflow) {
  record(workflow,['version','nodes','edges'],'Workflow');
  requireThat(workflow.version === 1,'Unsupported workflow version. Expected 1.');
  const {nodes,edges} = workflow;
  requireThat(Array.isArray(nodes) && nodes.length === 4, 'Include exactly four nodes.');
  const byId = new Map(), byType = new Map();
  for (const node of nodes) {
    inspectNode(node);
    requireThat(!byId.has(node.id),'Duplicate node ID.');
    requireThat(!byType.has(node.type),'Include one node of each type.');
    byId.set(node.id,node);
    byType.set(node.type,node);
  }
  requireThat(Array.isArray(edges) && edges.length === 3,'Connect all four nodes with exactly three edges.');
  const next = new Map(), incoming = new Set();
  for (const edge of edges) {
    record(edge,['from','to'],'Edge');
    requireThat(byId.has(edge.from) && byId.has(edge.to),'An edge references a missing node.');
    requireThat(!next.has(edge.from) && !incoming.has(edge.to),'Branches, merges and duplicate edges are unsupported.');
    next.set(edge.from,edge.to);
    incoming.add(edge.to);
  }
  const ordered = [], seen = new Set();
  let id = byType.get('input').id;
  while (id !== undefined) {
    requireThat(!seen.has(id),'Cycle detected.');
    seen.add(id);
    ordered.push(byId.get(id));
    id = next.get(id);
  }
  requireThat(ordered.length === 4,'The workflow has a disconnected node or cycle.');
  requireThat(ordered.every((n,i) => n.type === TYPES[i]),'Connect Input → Prompt Template → Model → Output.');
  // Per-field screening misses credentials split across the template and the input, so screen the joined prompt too.
  const prompt = render(ordered[1].config.template, ordered[0].config.text);
  requireThat(prompt.length <= LIMIT.prompt, 'Rendered prompt exceeds ' + LIMIT.prompt + ' characters.');
  credentialFree(prompt, 'Rendered prompt');
  return ordered;
}
export function parseWorkflow(raw) {
  requireThat(typeof raw === 'string' && new TextEncoder().encode(raw).length <= LIMIT.bytes,'Workflow exceeds the 32 KiB limit.');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Invalid('Invalid JSON.'); }
  plan(value);
  return value;
}
