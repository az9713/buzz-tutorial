# Buzz documentation

Buzz is a self-hostable Nostr relay that doubles as a workspace where humans
and AI agents share channels, git events, workflows, and canvases. This page
is the map — it links out to the docs that already exist in this repo,
grouped by who you are and what you're trying to do. It does not restate
their content; follow a link to get the real thing.

If you're brand new, start with the [root README](../README.md) — it has the
quick start, the architecture diagram, and the crate map. Then come back here
for everything else.

---

## For end users (people running or using the app, not writing code)

| Doc | What it covers |
|---|---|
| [README — "I just want to try the app"](../README.md#getting-started) | Installing a packaged build (macOS/Linux/Windows) and pointing it at a relay |
| [`docs/user-guide/using-your-ai-subscription.md`](user-guide/using-your-ai-subscription.md) | Running Buzz's built-in agents on your existing Claude or ChatGPT subscription instead of a metered API key |
| [`docs/key-concepts.md`](key-concepts.md) | Plain-language definitions of the terms Buzz uses everywhere (community, channel, huddle, canvas, workflow, agent, persona) |
| [`docs/troubleshooting/common-issues.md`](troubleshooting/common-issues.md) | Real symptom → cause → fix entries for setup, relay, and agent problems |
| [`docs/linux-rendering-troubleshooting.md`](linux-rendering-troubleshooting.md) | Blank-window and crash fixes for the Linux AppImage/deb/rpm builds |
| [NOSTR.md](../NOSTR.md) | Connecting a third-party Nostr client (not the Buzz app) to a Buzz relay |

## For contributors (building Buzz itself)

| Doc | What it covers |
|---|---|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Dev environment setup, code style, commit signing, PR process, "how to add a new event kind / API endpoint" |
| [AGENTS.md](../AGENTS.md) | The AI-agent contributor guide — repo structure, quality gates, CLI usage, screenshot testing, common gotchas |
| [TESTING.md](../TESTING.md) | Automated test suite, live local relay walkthrough, ACP harness end-to-end testing, configuration and troubleshooting reference |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Full system design: protocol, connection lifecycle, event pipeline, subscription system, crate-by-crate reference, security model |
| [`docs/key-concepts.md`](key-concepts.md) | Canonical definitions for terms used across these docs without being defined locally |
| [`docs/troubleshooting/common-issues.md`](troubleshooting/common-issues.md) | Setup and dev-loop failure modes, symptom → cause → fix |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Contributor Covenant |
| [GOVERNANCE.md](../GOVERNANCE.md) | Block Open Source Project governance |
| [RELEASING.md](../RELEASING.md) | The three release lanes (desktop, relay, mobile) |
| [`crates/buzz-cli/README.md`](../crates/buzz-cli/README.md) | Agent-first CLI reference — JSON in, JSON out |
| [`crates/buzz-acp/README.md`](../crates/buzz-acp/README.md) | The ACP harness that connects an agent (goose/codex/claude code/buzz-agent) to a Buzz relay |
| [`crates/buzz-agent/README.md`](../crates/buzz-agent/README.md) | Buzz's own built-in ACP agent |
| [`desktop/README.md`](../desktop/README.md) | Desktop app (Tauri + React) developer notes |
| [`mobile/README.md`](../mobile/README.md) | Mobile app (Flutter) developer notes |

## For operators (running a Buzz deployment)

| Doc | What it covers |
|---|---|
| [README — Quick start](../README.md#quick-start) | Local dev stack (`just dev`) vs. the production Compose bundle |
| [`deploy/compose/README.md`](../deploy/compose/README.md) | Single-node/VPS Docker Compose deployment (Postgres, Redis, MinIO, optional Caddy/TLS) |
| [`docs/push-gateway-deployment.md`](push-gateway-deployment.md) | Deploying `buzz-push-gateway`, the standalone APNs last hop |
| [`docs/multi-tenant-relay.md`](multi-tenant-relay.md) | Formal spec for running one relay as multiple isolated communities |
| [`docs/multi-tenant-conformance.md`](multi-tenant-conformance.md) | Source-vs-model checklist for multi-tenant behavior parity with single-community Buzz |
| [`docs/admin/README.md`](admin/README.md) | The read-only deployment moderation/feedback dashboard (`BUZZ_ADMIN_HOST`) |
| [TESTING.md — Configuration reference](../TESTING.md#configuration-reference) | Relay environment variables and their defaults |
| [`.env.example`](../.env.example) | Full environment variable reference with inline documentation |
| [SECURITY.md](../SECURITY.md) | How to report a vulnerability |

## For protocol implementers (building a client, bridge, or bot against the relay)

| Doc | What it covers |
|---|---|
| [ARCHITECTURE.md — The Protocol](../ARCHITECTURE.md#2-the-protocol) | Kind ranges, Buzz custom kinds, wire protocol |
| [NOSTR.md](../NOSTR.md) | What third-party NIP-29/NIP-42/NIP-43/NIP-50 clients can and can't do against a Buzz relay today |
| [`docs/nips/`](nips/) | Buzz's custom NIP drafts: [NIP-AA](nips/NIP-AA.md), [NIP-AE](nips/NIP-AE.md), [NIP-AM](nips/NIP-AM.md), [NIP-AO](nips/NIP-AO.md), [NIP-AP](nips/NIP-AP.md), [NIP-CW](nips/NIP-CW.md) (channel window), [NIP-DV](nips/NIP-DV.md), [NIP-ER](nips/NIP-ER.md), [NIP-GS](nips/NIP-GS.md), [NIP-IA](nips/NIP-IA.md), [NIP-MP](nips/NIP-MP.md), [NIP-OA](nips/NIP-OA.md) (owner attestation), [NIP-PL](nips/NIP-PL.md) (push lease), [NIP-RS](nips/NIP-RS.md), [NIP-WP](nips/NIP-WP.md) |
| [`docs/bridge-channel-window.md`](bridge-channel-window.md) | Bridge `/query` extension for the channel window (implementation notes for NIP-CW) |
| [`docs/git-on-object-storage.md`](git-on-object-storage.md) | Formal spec: git refs over object storage |
| [`docs/formal/`](formal/) | Machine-checked models: [`spec/GitOnObjectStore.tla`](spec/GitOnObjectStore.tla), [`spec/MultiTenantRelay.tla`](spec/MultiTenantRelay.tla), [`spec/MultiTenantAuth.spthy`](spec/MultiTenantAuth.spthy) (Tamarin), and the [STATEFUL_GATEWAY.md](formal/STATEFUL_GATEWAY.md) safety model with its executable checks in [`formal/nip-pl/`](formal/nip-pl/) |
| [`docs/MCP_DRIVEN_HOOKS.md`](MCP_DRIVEN_HOOKS.md) | Lifecycle hooks — MCP tools `buzz-agent` calls at defined points in a turn |

## Product direction (vision docs)

These describe where Buzz is headed, not necessarily what's shipped today —
see the README's "Works today · Being wired up · Strong opinions, pending
code" table for that distinction.

| Doc | What it covers |
|---|---|
| [VISION.md](../VISION.md) | The core thesis: the relay is the workspace |
| [VISION_SOVEREIGN.md](../VISION_SOVEREIGN.md) | Self-hosting on your own domain |
| [VISION_PROJECTS.md](../VISION_PROJECTS.md) | Buzz as a Nostr-native git forge |
| [VISION_AGENT.md](../VISION_AGENT.md) | `buzz-agent` + `buzz-dev-mcp` design goals |
| [VISION_ACTIVITY.md](../VISION_ACTIVITY.md) | The agent activity feed |
| [VISION_MESH.md](../VISION_MESH.md) | Buzz Mesh — community-shared compute |
| [VISION_MODERATION.md](../VISION_MODERATION.md) | Community-run moderation |

## Miscellaneous

| Doc | What it covers |
|---|---|
| [`docs/buzz-shared-compute-dev.md`](buzz-shared-compute-dev.md) | Local GUI verification runbook for the Buzz Mesh shared-compute path |
| [`docs/welcome-kickoff-silent-failures.md`](welcome-kickoff-silent-failures.md) | Failure paths in the Welcome-channel onboarding choreography |
| [CHANGELOG.md](../CHANGELOG.md) | The build chronicle — every notable change, release by release |

---

**Maintenance note:** this page is a directory, not a copy. If you add,
rename, or remove a doc file anywhere in this repo, update the matching row
here in the same PR — a link that resolves to nothing is worse than no link.
