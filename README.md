# Relay — Open-Source Visual AI Agent Builder

Relay is a local visual editor for a four-step text workflow. The synthetic support demo connects **Input → Prompt Template → Model → Output**. You can edit the request and template, move nodes, reconnect ports, and replay exported JSON from the command line. The included model is a deterministic keyword stub.

## Run the editor

Use Node.js **22.19.0**, the tested version. The application and core tests use Node built-ins and native browser APIs. Run these commands from the directory containing `package.json`.

```shell
node server.mjs
```

Open [the local editor](http://127.0.0.1:4316). Use the literal address shown. Port 4316 must be free. Stop the server with Ctrl+C. The server does not persist edits. Export before refreshing or closing the page.

## Two-minute demo

1. Select **Run workflow**. The duplicated-charge fixture produces `billing`. The trace displays the input, rendered prompt, model response and final text in traversal order.
2. Select **Input**, change the request to `My login is locked.`, and run again. The stub returns `account`. Drag the card and rerun to see the same trace.
3. In the Input inspector, select **Disconnect**. The canvas shows a validation error and disables Run. Click Input’s right port and then Prompt Template’s left port to reconnect them. Ports and node selection also support Tab and Enter.
4. Select **Export JSON**. Copy the displayed JSON or use **Download JSON**. Select **Import JSON** to reopen a valid workflow file. The editor checks it before replacing the current graph.
5. Select **Model**, change **Stub behavior** to **Simulate provider failure**, and run. The trace identifies Model as failed and Output as skipped. Set the mode back to **Classify request** to resume.

## Headless replay and tests

```shell
node cli.mjs examples/support.json
npm test
```

For an exported file, use `node cli.mjs path/to/relay-workflow.json`. The CLI prints the same result object the editor receives. Exit codes are 0 for success, 1 for a node failure, and 2 for a file or validation error. Core and request-handler tests run offline.

## Optional browser verification

With Chrome installed, install the test driver once in the source directory. Its version is checked at startup. On a machine with the package already installed, set `RELAY_BROWSER_MODULES` to its Node resolution root instead.

```shell
npm install --no-save --package-lock=false --ignore-scripts playwright-core@1.63.0
npm run test:browser
```

The default check starts a server on an ephemeral loopback port, drives Chrome, saves the exported file, invokes the actual CLI on that file, and imports it again. For environments with restricted sockets, `node tests/browser.mjs --in-process` drives Chrome through the same HTTP handler using Playwright routing. In this mode the test verifies the browser's download event, suggested filename and serialized payload, and writes those bytes to a temporary file for replay. Add `--check-download` to also require Chrome's native download manager to save the file. Desktop and 390-pixel layouts are exercised. The headless test cleans up its temporary directory and closes the browser.

## Workflow format and execution

See [examples/support.json](examples/support.json) for the complete v1 document. Node IDs must be unique, start with a letter and contain up to 40 ASCII letters, digits, underscores or hyphens. Each node has `id`, `type`, `config`, and optional `position` with numeric x/y from 0 through 2400. Each edge contains `from` and `to` IDs. Root, node, config, edge and position fields use exact allowlists.

| Node | Configuration | Text behavior |
| --- | --- | --- |
| Input | `text` | Provides one nonblank synthetic request |
| Prompt Template | `template` | Substitutes the input literally at exactly one `{{input}}`; other braces are invalid |
| Model | `provider: "local-stub"`, `model: "support-v1"`, `mode` | Classifies the rendered prompt or simulates a failure |
| Output | Empty object | Passes through the successful model text |

The planner indexes IDs, checks edge endpoints and degrees, and follows outgoing edges from Input. It checks every visited type and requires all four nodes to be reachable. The executor consumes that ordered plan. Position, node array order and edge array order have no execution semantics. The UI imports the same validator as the server and CLI. Only the server and CLI import the executor and provider.

| Boundary | Limit |
| --- | --- |
| Workflow file or POST body | 32 KiB of UTF-8 JSON |
| Input / template / rendered prompt | 2,048 / 1,024 / 3,072 UTF-16 code units |
| Model output | 128 UTF-16 code units, nonblank text |
| Work per run | Four nodes, one model call, no retries |
| Provider calls per process | At most 1 unsettled call. A run that finds a call still running (for example, one abandoned after a timeout) fails Model without calling the provider. |
| Time | 3 s body-read deadline, 2 s executor deadline, 750 ms maximum model wait |
| HTTP | IPv4 loopback only, exact Host, same-origin browser requests, fixed asset paths, JSON-only POST, up to 16 connections |

HTTP requests have separate ingress and execution budgets. The server also configures a 3 s header timeout and a 6 s HTTP request timeout. A failed step keeps its error, marks subsequent steps skipped, and returns a null final output. The run deadline is checked between nodes. The model timer signals cancellation and bounds the awaited result. The in-flight slot is released only when the provider's own promise settles, so a provider that ignores cancellation blocks later runs instead of stacking calls; one that never settles blocks them until restart. JavaScript timers cannot preempt blocking code. Milestone 1 contains one trusted, bounded, in-process stub. A real adapter will need transport-level cancellation.

## Scope and limitations

- The classifier scans the rendered prompt in a fixed order and returns `billing`, `account`, `technical` or `other`. The example shows reproducibility. There is no development/evaluation result or model-quality claim.
- The process reads no provider credentials. The contract rejects credential fields, unknown provider settings, endpoint fields and tools. It rejects several recognizable credential patterns in IDs, in each text field, and in the rendered prompt, so a pattern split across the template and the input is also rejected before any call. Free text can still contain an unrecognizable secret. Use synthetic text only. Exported workflows and displayed traces contain plain text.
- The visual workspace supports one linear graph with four required node types. One workflow lives in the current tab. Saving JSON is explicit. The CLI reads just the file supplied by the operator.
- The local service is designed for one trusted user. Applications running on the same computer can invoke it. There is no per-user authentication or deployment configuration.
- Real inference, held-out scoring, hosted CI and the remaining MVP are pending independent review.

[Environment, licenses and reuse decisions](docs/environment.md) · [MIT license](LICENSE)
