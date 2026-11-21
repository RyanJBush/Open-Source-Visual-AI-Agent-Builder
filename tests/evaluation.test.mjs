import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {LABELS} from '../public/contract.mjs';
import {outcome,summarize} from '../evaluation/score.mjs';

test('both frozen splits have unique inputs and keys in the approved vocabulary',() => {
  const seen = new Set();
  for (const split of ['dev','heldout']) {
    const load = suffix => JSON.parse(readFileSync(new URL('../evaluation/'+split+suffix,import.meta.url)));
    const cases = load('.json'), key = load('-key.json');
    assert.deepEqual(cases.map(c => c.id).sort(),Object.keys(key).sort());
    for (const {id,request,...rest} of cases) {
      assert.deepEqual(rest,{});
      assert.ok(LABELS.includes(key[id]));
      assert.ok(!seen.has(request.toLowerCase().trim())); seen.add(request.toLowerCase().trim());
    }
  }
});
test('invalid replies and execution failures stay in the denominator; other is a scored label',() => {
  const classify = code => outcome({status:'failed',steps:[{state:'failed',errorCode:code}]});
  const outcomes = [outcome({status:'succeeded',output:'other'}),'label',classify('invalid-response'),classify(undefined)];
  const rows = outcomes.map((v,i)=>({outcome:v,predicted:i===0?'other':null,expected:'other',elapsedMs:i+1,calls:i===3?0:1}));
  assert.deepEqual(summarize(rows),{correct:1,total:4,invalid:1,abstentions:0,failures:1,medianMs:2.5,p95Ms:4,calls:3});
});
