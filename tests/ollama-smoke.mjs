// Opt-in smoke test against a real local Ollama server. Running this script is the opt-in:
// it enables the adapter only for the CLI processes it starts. Requires `ollama serve` and `ollama pull qwen3:4b`.
// It checks the integration path (request, constrained label, bounds, CLI exit code). It is not a quality evaluation.
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LABELS} from '../public/contract.mjs';

const base = JSON.parse(readFileSync(new URL('../examples/support-ollama.json', import.meta.url)));
const env = {...process.env, RELAY_ENABLE_OLLAMA: '1'};
const dir = mkdtempSync(join(tmpdir(), 'relay-ollama-'));
let failed = 0;
try {
  for (const [name, text] of [['fixture', null], ['repeat (warm model)', null], ['short request', 'The app crashes when I open settings.']]) {
    const w = structuredClone(base);
    if (text) w.nodes.find(n => n.type === 'input').config.text = text;
    const file = join(dir, 'w.json'); writeFileSync(file, JSON.stringify(w));
    const t = performance.now();
    const p = spawnSync(process.execPath, [fileURLToPath(new URL('../cli.mjs', import.meta.url)), file], {encoding: 'utf8', env, timeout: 22000, killSignal: 'SIGKILL'});
    const ms = Math.round(performance.now() - t);
    let r; try { r = JSON.parse(p.stdout); } catch { r = null; }
    const ok = p.status === 0 && r?.provider === 'ollama' && r.calls === 1 && LABELS.includes(r.output);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: exit=${p.status} provider=${r?.provider} calls=${r?.calls} output=${r?.output ?? null} wall=${ms}ms${ok ? '' : ' ' + (r?.steps?.find(s => s.error)?.error ?? p.error?.message ?? p.stderr?.trim() ?? 'CLI did not finish')}`);
  }
} finally { rmSync(dir, {recursive: true, force: true}); }
process.exitCode = failed ? 1 : 0;
