# Milestone 1 environment and reuse audit

Checked November 20, 2026 on the Windows workstation. Its start directory contained empty work and outputs directories and was outside a Git repository. No on-disk AGENTS.md appeared on the current directory's ancestor path. The instructions supplied in the task apply. C:\workspace did not exist.

## Checkout discovery

Searched the user's Documents, Desktop, Downloads, OneDrive, code, Projects, CLionProjects, llm-gateway and ai-agent-course trees by project-name patterns and Git configuration. The search skipped dependency trees, hidden directories and common generated trees. It found several reference-project checkouts and unrelated voice-agent skill directories. No matching Project 16 checkout appeared. The connected GitHub repository search for `user:RyanJBush visual` also returned zero matches. Neither search establishes absence elsewhere. A new local `main` repository was initialized under `work/relay`. No remote was configured.

## Tools and access

| Check | Observed result |
| --- | --- |
| Python | 3.13.7 default, 3.12 also registered |
| Installed Python libraries | FastAPI 0.162.0, Pydantic 2.13.5, Uvicorn 0.53.0, pytest 9.2.0, HTTPX 0.28.1 |
| Node / npm / pnpm / Git | 22.19.0 / 10.9.3 / 10.34.7 / 2.55.0.windows.5 |
| Frontend tooling | React, React Flow, Vite and TypeScript were unavailable at the inspected user-level Node resolution root. npm cache lookup returned no React Flow entry. |
| Browser tooling | Chrome, Edge and user-level playwright-core 1.63.0 were located. Verification used Chrome. |
| Ollama | CLI 0.40.16. Local manifests for qwen3:4b, qwen3-coder:latest, granite3.2-vision:2b and embeddinggemma:latest. `ollama list` could not connect to 127.0.0.1:11434 in this sandbox. Model readiness is unverified. |
| Credentials | ANTHROPIC_API_KEY was populated. OPENAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY and HF_TOKEN were absent from the checked process environment. Values were never printed. Usability, billing and account permissions were not tested. |
| Networking | Binding a loopback listener succeeded. Python's client socket was denied with WinError 10013. Chrome's live HTTP navigation returned ERR_NETWORK_ACCESS_DENIED. The shell GitHub API request could not connect. The connected GitHub interface provided repository files. |

## Dependency decision

The four-card editor uses DOM controls and vector connectors. Node serves the static interface, validates the POST and runs the same executor as the CLI. This keeps the offline setup to one runtime, avoids a build step, and avoids synchronizing two validation implementations. If later scope requires large graphs or advanced canvas interactions, reconsider React Flow.

| Component | Pinned or observed version | License and usage |
| --- | --- | --- |
| Node.js | 22.19.0 in .nvmrc | MIT for Node core, with separately licensed bundled components in the upstream license. User-installed runtime. [Versioned license](https://github.com/nodejs/node/blob/v22.19.0/LICENSE) |
| Application packages | None | No frontend or backend package installation. Node's built-in test runner handles the core suite. |
| playwright-core | 1.63.0, optional test-only | Apache-2.0 per the installed package metadata. No browser binaries are redistributed. [Upstream license](https://github.com/microsoft/playwright/blob/main/LICENSE) |
| Google Chrome | Installed browser, version in verification output | Vendor-distributed browser, separate from this source package. |

Original project source is offered under MIT. No third-party source, fonts, images, browser builds or provider packages are bundled.

## Prior projects inspected

The local Git client could not change directory into reference checkouts under this sandbox. The connected GitHub interface supplied the following files from the default branches. The identifiers below are inspected Git blob SHAs.

| Repository | Interface, dependencies and license | Decision |
| --- | --- | --- |
| [SwarmOS](https://github.com/RyanJBush/swarmos) | CLI calls the SWARM-001 controller, evidence and history modules. `swarmos/__main__.py` blob 0fa6cfb2703c9825c2824e4d4fe3e75a7a19b31f. README requires Git and Python 3.11+. Inspected pytest configuration and pinned development test dependencies. MIT LICENSE blob 30a8a93a34a55ab588ffcb77cf5fc7365df938c3. | Its coding-workflow, repository writes and history are outside this executor. No code copied. |
| [Self-Healing LLM Gateway](https://github.com/RyanJBush/self-healing-llm-gateway) | POST /v1/generations, primary/fallback routing and retries. `gateway/providers.py` defines Provider, CallContext, RawResponse and StubProvider. Blob 46178ed64e4af68353af8c75d269266877f83a06. Python 3.11+, Uvicorn, optional HTTPX; MIT LICENSE blob 734d1668be5f86f43a207c59c258c0e510aea020. | Retry/fallback behavior exceeds the single-call contract. No code copied. |
| [Prompt-Injection Guardrails](https://github.com/RyanJBush/prompt-injection-guardrails) | Gate, TaskConfig, Decision and MockExecutor authorize scripted tool operations. `gate.py` blob 990c38dceeebfc404ebc05c6b2a484ac5555a2cf uses Python standard-library imports; requirements-dev.txt specifies pytest>=8. Root LICENSE and pyproject.toml lookups returned 404. | No tools in the editor and no verified reuse license. No code copied. |
