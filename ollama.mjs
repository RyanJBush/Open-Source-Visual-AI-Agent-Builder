import {LABELS} from './public/contract.mjs';

// A provider failure whose message is safe to show in traces. Any other error is reported generically.
export class ProviderError extends Error {}
export class InvalidReply extends ProviderError {}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const SYSTEM = 'You label customer support requests. Labels: billing (charges, invoices, refunds, payments), ' +
  'account (login, password, sign-in, locked account), technical (crashes, errors, bugs), other (anything else). ' +
  'Reply with the single label only.';
const MAX_RESPONSE_BYTES = 65536;
async function readReply(response) {
  if (!response.body) throw new InvalidReply('Ollama returned an unreadable response.');
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new InvalidReply('Ollama response is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

// Opt-in adapter for a local Ollama server. Settings come from the server's environment, never from a workflow:
//   RELAY_ENABLE_OLLAMA=1         required; otherwise every call is refused before any request
//   RELAY_OLLAMA_URL              optional plain http loopback origin, default http://127.0.0.1:11434
//   RELAY_OLLAMA_MAX_CALLS        optional per-process call budget, default 50
// The abort signal is passed to fetch and to body reading, so a timed-out call settles promptly
// and frees the engine's in-flight slot.
export function createOllama({env = process.env, fetchImpl = (...args) => fetch(...args)} = {}) {
  let used = 0;
  function settings() {
    if (env.RELAY_ENABLE_OLLAMA !== '1') return {refusal: 'Ollama is disabled. Restart Relay with RELAY_ENABLE_OLLAMA=1 to allow local model calls.'};
    let origin;
    try { origin = new URL(env.RELAY_OLLAMA_URL || 'http://127.0.0.1:11434'); }
    catch { return {refusal: 'RELAY_OLLAMA_URL is not a valid URL.'}; }
    if (origin.protocol !== 'http:' || !LOOPBACK.has(origin.hostname) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
      return {refusal: 'RELAY_OLLAMA_URL must be a plain http loopback origin such as http://127.0.0.1:11434.'};
    const raw = env.RELAY_OLLAMA_MAX_CALLS ?? '50';
    if (!/^\d{1,6}$/.test(raw)) return {refusal: 'RELAY_OLLAMA_MAX_CALLS must be a whole number.'};
    if (used >= Number(raw)) return {refusal: 'Ollama call budget for this process is used up (' + Number(raw) + '). Restart Relay to reset it.'};
    return {endpoint: new URL('/api/chat', origin).href, host: origin.host};
  }
  return {
    admit() { return settings().refusal; },
    async call(prompt, config, signal) {
      const {endpoint, host, refusal} = settings();
      if (refusal) throw new ProviderError(refusal);
      used++;
      let response, text;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST', headers: {'content-type': 'application/json'}, redirect: 'error', signal,
          body: JSON.stringify({
            model: config.model, stream: false, think: false, keep_alive: '10m',
            format: {type: 'string', enum: LABELS},
            options: {temperature: 0, seed: 0, num_predict: 8},
            messages: [{role: 'system', content: SYSTEM}, {role: 'user', content: prompt}]
          })
        });
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 404) throw new ProviderError('Ollama does not have ' + config.model + '. Run: ollama pull ' + config.model);
          throw new ProviderError('Ollama returned HTTP ' + response.status + '.');
        }
        text = await readReply(response);
      } catch (err) {
        if (signal.aborted || err instanceof ProviderError) throw err;
        throw new ProviderError('Ollama is not reachable at ' + host + '. Start it with: ollama serve');
      }
      let label;
      try { label = JSON.parse(JSON.parse(text).message.content); }
      catch { throw new InvalidReply('Ollama returned an unreadable response.'); }
      if (!LABELS.includes(label)) throw new InvalidReply('Ollama returned an unrecognized label.');
      return label;
    }
  };
}
