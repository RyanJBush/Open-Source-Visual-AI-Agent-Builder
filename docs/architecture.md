# How a workflow runs

The editor keeps one workflow in tab memory. JSON v1 is the interchange format. Saving a file is explicit. The same exported bytes can be imported in the editor or passed to the CLI.

| Boundary | Owner | Behavior |
| --- | --- | --- |
| Authoring | public/app.mjs | Moves cards, connects ports, edits typed configuration, imports/exports JSON and renders the ordered trace |
| Validation | public/contract.mjs | Restricts root, nodes and edges to the approved schema, checks the literal placeholder and rendered prompt, and traverses the required path |
| Entrypoints | server.mjs and cli.mjs | Apply byte and decoding limits before execution. HTTP also checks loopback Host, Origin, media type and body deadline. CLI opens the operator-selected file. |
| Execution | engine.mjs | Follows the validated path, tracks calls, deadlines and node states, and stops at the first failure |
| Providers | engine.mjs and ollama.mjs | The default keyword function runs in process. The opt-in local Ollama adapter checks its settings and budget before sending a single constrained chat request. |
| Evaluation | evaluation/run.mjs | Replays the same synthetic requests, stores predictions with wall times, and compares each result with a separately stored answer key |

### Provider lifetime

The engine allows one unsettled provider call per process. A timeout aborts the adapter's fetch. An adapter that ignores cancellation holds the slot until its promise settles. Enabling the local adapter is a server/CLI decision. The browser can select the approved provider and model, but cannot change the origin or authorize the process. A fresh CLI process has its own call budget. For the complete numeric limits see the workflow contract in the README.

Ollama's successful response body is read as bytes. The reader cancels on the first chunk that would take retained payload above 65,536 bytes. Error responses are canceled without decoding their bodies. The user-facing model output remains limited to a single approved label and the executor's text bound. The editor displays the resulting provider identity in its execution trace.

### Evaluation boundary

The taxonomy and fixed system instruction are part of the classifier. The workflow's user message contains the shared literal template and the synthetic request. Case IDs and answer keys are kept outside model messages. The keyword rules, model instruction and evaluation inputs were frozen together before scoring. Evidence reports include per-input-file hashes, local runtime identity, and every attempted result.
