# Classifying synthetic support requests

**Both methods scored 16/24 (66.7%) on the same held-out cases.** They agreed on ten correct answers. Each got six cases right that the other missed, and both missed two. This sample shows different error patterns at the same overall accuracy.

| Split / method | Correct / total | Invalid | Abstained | Execution failures | Median ms | p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Development / keyword | 8/8 | 0 | 0 | 0 | 0.164 | 1.131 |
| Development / local qwen3:4b | 5/8 | 0 | 0 | 0 | 134.711 | 394.915 |
| Held-out / keyword | 16/24 | 0 | 0 | 0 | 0.063 | 0.290 |
| Held-out / local qwen3:4b | 16/24 | 0 | 0 | 0 | 142.874 | 182.799 |

Latency is executor wall time. The local model ran after the development split, on the same machine, without a forced cold reload. The model made 24 local chat calls on the held-out split. External API calls were zero. Dollar cost and power consumption were unmeasured. Both classifiers always attempt one of four labels; the interface has no abstention response. An out-of-vocabulary reply is invalid. All cases remain in the denominator.

| Expected category | Held-out cases | Keyword correct | Ollama correct |
| --- | ---: | ---: | ---: |
| Billing | 6 | 4 | 6 |
| Account | 6 | 3 | 4 |
| Technical | 6 | 3 | 5 |
| Other | 6 | 6 | 1 |

The upload-freeze request in case 04 produced `other` from the keyword fallback and `technical` from Ollama. The help-desk-hours question in case 12 produced `other` from the baseline and `billing` from Ollama. A classification can be well-formed and still be wrong.

### Reproducibility and limitations

The protocol, two splits, answer keys, prompts, baseline and scoring code were committed at `9663544c8ccdf5a1cf9c303eeb8e8445324d2386` before either scored run. No prompt tuning followed the held-out run. The development and held-out files have unique request text. The answer key was used by the scorer only. The model's system instruction defined the four available labels. Each evidence file records the exact input hashes, model digest, Node version, per-case predictions, timing and errors.

**Reproducibility check after the reply-type fix.** Commit `132133c9061b912afae2f7fc51a8ebebced6572f` changed `ollama.mjs` to reject non-string `message.content` (the frozen code could accept a one-element array as a label) and to refuse an explicitly empty `RELAY_OLLAMA_URL`. The evidence files above were produced by the earlier code, so their `ollama.mjs` input hash no longer matches the shipped file. On 2026-11-20 both splits were rerun once on `6fe6663` and once on `132133c` on the same machine with the same model digest (`359d7dd4bcda`). All 128 per-case predictions and outcomes (64 per revision) matched the recorded evidence, so the reported accuracy is unchanged. Latency varied between runs. Those reruns are a reproducibility check only and did not replace the recorded results.

These are 24 human-readable, implementer-authored synthetic evaluation cases with equal category counts. A single case changes the overall percentage by about 4.2 points. The sample does not represent the distribution, language variety or ambiguity of real support traffic. Hardware, model residency and competing work affect latency.

[Development evidence](../evidence/dev.json) · [Held-out evidence](../evidence/heldout.json) · [Frozen scoring protocol](../evaluation/PROTOCOL.md)
