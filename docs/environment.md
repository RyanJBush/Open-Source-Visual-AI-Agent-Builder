# Environment, licenses and reuse

The implementation began as a fresh local checkout. No code was copied from the three earlier projects below. The release was tested on Windows with Node 22.19.0, npm 10.9.3, Playwright Core 1.63.0, Chrome 158.0.8127.36 and local Ollama 0.40.16. No paid provider credentials are required.

## Dependency decision

The four-card editor uses DOM controls and vector connectors. Node serves the static interface, validates the POST and runs the same executor as the CLI. This keeps the offline setup to one runtime, avoids a build step, and avoids synchronizing two validation implementations. If later scope requires large graphs or advanced canvas interactions, reconsider React Flow.

| Component | Pinned or observed version | License and usage |
| --- | --- | --- |
| Node.js | 22.19.0 in .nvmrc | MIT for Node core, with separately licensed bundled components in the upstream license. User-installed runtime. [Versioned license](https://github.com/nodejs/node/blob/v22.19.0/LICENSE) |
| Application packages | None | No frontend or backend package installation. Node's built-in test runner handles the core suite. |
| playwright-core | 1.63.0, optional test-only | Apache-2.0 per the installed package metadata. No browser binaries are redistributed. [Upstream license](https://github.com/microsoft/playwright/blob/main/LICENSE) |
| Google Chrome | Installed browser, version in verification output | Vendor-distributed browser, separate from this source package. |

Additional components used by the MVP:

| Component | Version or identity | License and role |
| --- | --- | --- |
| Ollama | 0.40.16 | MIT, separately installed optional inference service. [License](https://github.com/ollama/ollama/blob/main/LICENSE) |
| qwen3:4b | Q4_K_M, digest 359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7 | Local model metadata returned Apache License 2.0. Weights are obtained separately. |
| actions/checkout, actions/setup-node | Exact commit SHAs in the CI workflow | Both are MIT. Used to bootstrap the hosted runner. Core checks have zero package-install steps and run offline. |

Original project source is offered under MIT. No third-party source, fonts, images, browser builds or provider packages are bundled.

## Prior projects inspected

The local Git client could not change directory into reference checkouts under this sandbox. The connected GitHub interface supplied the following files from the default branches. The identifiers below are inspected Git blob SHAs.

| Repository | Interface, dependencies and license | Decision |
| --- | --- | --- |
| [SwarmOS](https://github.com/RyanJBush/swarmos) | CLI calls the SWARM-001 controller, evidence and history modules. `swarmos/__main__.py` blob 0fa6cfb2703c9825c2824e4d4fe3e75a7a19b31f. README requires Git and Python 3.11+. Inspected pytest configuration and pinned development test dependencies. MIT LICENSE blob 30a8a93a34a55ab588ffcb77cf5fc7365df938c3. | Its coding-workflow, repository writes and history are outside this executor. No code copied. |
| [Self-Healing LLM Gateway](https://github.com/RyanJBush/self-healing-llm-gateway) | POST /v1/generations, primary/fallback routing and retries. `gateway/providers.py` defines Provider, CallContext, RawResponse and StubProvider. Blob 46178ed64e4af68353af8c75d269266877f83a06. Python 3.11+, Uvicorn, optional HTTPX; MIT LICENSE blob 734d1668be5f86f43a207c59c258c0e510aea020. | Retry/fallback behavior exceeds the single-call contract. No code copied. |
| [Prompt-Injection Guardrails](https://github.com/RyanJBush/prompt-injection-guardrails) | Gate, TaskConfig, Decision and MockExecutor authorize scripted tool operations. `gate.py` blob 990c38dceeebfc404ebc05c6b2a484ac5555a2cf uses Python standard-library imports; requirements-dev.txt specifies pytest>=8. Root LICENSE and pyproject.toml lookups returned 404. | No tools in the editor and no verified reuse license. No code copied. |
