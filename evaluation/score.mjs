import {LABELS} from '../public/contract.mjs';

export function outcome(result) {
  if (result.status === 'succeeded') return LABELS.includes(result.output) ? 'label' : 'invalid';
  const failed = result.steps.find(step => step.state === 'failed');
  return failed?.errorCode === 'invalid-response' ? 'invalid' : 'failure';
}

export function summarize(rows) {
  if (!rows.length) throw new Error('Expected at least one scored case.');
  const times = rows.map(row => row.elapsedMs).sort((a,b) => a-b);
  const middle = Math.floor(times.length/2);
  const median = times.length % 2 ? times[middle] : (times[middle-1]+times[middle])/2;
  return {
    correct: rows.filter(row => row.outcome === 'label' && row.predicted === row.expected).length,
    total: rows.length,
    invalid: rows.filter(row => row.outcome === 'invalid').length,
    abstentions: 0,
    failures: rows.filter(row => row.outcome === 'failure').length,
    medianMs: Number(median.toFixed(3)),
    p95Ms: times[Math.ceil(.95*times.length)-1],
    calls: rows.reduce((sum,row) => sum+row.calls,0)
  };
}
