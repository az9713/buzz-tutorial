# Key concepts

A glossary of terms used across the Buzz docs without being re-defined each
time. Definitions here are pulled from the code and the existing docs (cited
inline) — not from general background knowledge. If a term you hit in
another doc isn't here, that's a gap; add it in the same PR that introduced
the term.

---

**Nostr** — the open protocol Buzz is built on. Identity is a secp256k1
keypair, not an account or password: your public key *is* your identity.
Everything that happens — a message, a reaction, a workflow step, a review
approval, a git event — is a JSON "event," Schnorr-signed by that keypair,
pushed to a relay over WebSocket. Because identity is just a keypair with no
notion of "human" or "bot" baked in, a person and an AI agent can be the
same *kind* of participant — same event shape, same signature, same audit
trail, different key. Buzz implements the protocol via the `nostr` crate
(version 0.44, with the `nip44` and `nip98` features enabled). Source:
[README — "What is this, really?"](../README.md#what-is-this-really),
[`Cargo.toml:62`](../Cargo.toml).

**NIP (Nostr Implementation Possibility)** — a numbered, versioned spec for
one piece of protocol behavior (event format, auth flow, encryption scheme,
etc.), the mechanism the wider Nostr ecosystem uses to standardize
extensions. Buzz implements a mix of standard NIPs — NIP-01 (base protocol),
NIP-29 (relay-based groups), NIP-42 (auth), NIP-44 (encrypted payloads),
NIP-49 (encrypted key export), NIP-50 (search), NIP-98 (HTTP auth) among
others — and defines its own custom NIP drafts for behavior the standard
protocol doesn't cover (channel windows, agent engrams, push leases, and
more). The 15 in-tree Buzz-authored drafts live in
[`docs/nips/`](nips/). Source: [NOSTR.md](../NOSTR.md),
[`docs/nips/`](nips/).

**Relay** — the Buzz server process (`buzz-relay`), the single source of
truth for a community. It speaks NIP-01 over WebSocket (`EVENT`/`REQ`/`CLOSE`
messages) plus a REST bridge for channel/DM/media/workflow/git operations,
backed by Postgres (events + full-text search), Redis (pub/sub, presence,
typing), and S3/MinIO (media). Every message, reaction, workflow step,
review approval, and git event is a signed Nostr event stored in one log.
Source: [README — Architecture](../README.md#architecture),
[ARCHITECTURE.md §6](../ARCHITECTURE.md#6-crate-reference).

**Community** — the workspace a user reaches by URL. The server resolves a
`TenantContext` from the request host *before* any handler can observe
tenant data (`ARCHITECTURE.md` "Step 0: Community Binding"). In the
single-relay setup that ships today, one relay URL selects exactly one
community — the URL is authoritative for the workspace, and all
tenant-observable state under that URL is community-local. A hosted operator
can run many communities behind many domains on shared Postgres/Redis/object
storage, but each community keeps the same semantic boundary: tenant rows,
cache keys, search documents, workflow state, media metadata, audit chains,
and huddle rooms are all scoped by the host-derived community. Source:
[README — "What is this, really?"](../README.md#what-is-this-really),
[ARCHITECTURE.md §3](../ARCHITECTURE.md#3-connection-lifecycle).

**Channel** — a room inside a community: a persistent, addressable space for
messages, threads, DMs, canvases, and (optionally) a git branch or a
workflow trigger scope. Channel metadata is kind `39000`
(`KIND_CHANNEL_METADATA`, not the unused NIP-01 kind 41 — see
[AGENTS.md — Common Gotchas #1](../AGENTS.md#common-gotchas)). Channels use
NIP-29 group-chat semantics for membership and message kinds. Source:
[ARCHITECTURE.md §2](../ARCHITECTURE.md#2-the-protocol).

**Kind ranges** — Nostr events are typed by a `u32` "kind." Buzz partitions
the space so custom event types don't collide with the standard protocol:

| Range | Meaning |
|---|---|
| 0–9999 | Standard Nostr kinds (NIP-01 and other NIPs) |
| 10000–19999 | Replaceable events (NIP-16) |
| 20000–29999 | Ephemeral events — not stored, not audited |
| 30000–39999 | Parameterized replaceable events |
| 40000–49999 | Buzz custom kinds |

`buzz-core` defines all 81 kinds as `pub const KIND_*: u32` and exports
`ALL_KINDS: &[u32]`. Examples: kind `9` is a stream (chat) message, `40100`
is a canvas, `41010` opens a DM, `43001` is an agent job request,
`45001`/`45003` are forum post/comment, `46001`–`46012` are workflow
execution events, `20001` is an ephemeral presence heartbeat, and `1059` is
the standard Nostr gift-wrap kind (NIP-17). Source:
[ARCHITECTURE.md §2 — Kind Ranges](../ARCHITECTURE.md#2-the-protocol),
[`crates/buzz-core/src/kind.rs`](../crates/buzz-core/src/kind.rs).

**NIP-42** — the Nostr authentication protocol for WebSocket connections.
Immediately on connect, the relay sends `["AUTH", "<challenge>"]` (a random
string); the client must respond with a signed `["AUTH", <event>]` before it
can submit events or subscriptions. Success transitions
`ConnectionState.auth_state` from `Pending` to `Authenticated(AuthContext)`.
Source: [ARCHITECTURE.md §3 — Step 2/3](../ARCHITECTURE.md#3-connection-lifecycle).

**NIP-98** — the Nostr HTTP-auth protocol: a Schnorr-signed `kind:27235`
event carried as a header, used to authenticate REST/HTTP bridge endpoints
(as opposed to NIP-42, which authenticates the WebSocket connection itself).
Buzz CLI's non-key auth mode and admin dashboard access both build on this.
Source: [ARCHITECTURE.md §3 — Step 3](../ARCHITECTURE.md#3-connection-lifecycle).

**Membership** — the relay's own access-control roster, separate from
per-channel membership. `buzz-admin add-member`/`remove-member` add or
remove a pubkey and publish a kind `13534` roster event; `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true`
restricts who may connect at all. Source:
[ARCHITECTURE.md §6 — buzz-admin](../ARCHITECTURE.md#6-crate-reference),
[TESTING.md — Configuration reference](../TESTING.md#configuration-reference).

**Audit log** — a tamper-evident, append-only log (`buzz-audit`) using
SHA-256 hash chaining: each entry stores the hash of the previous entry, so
`verify_chain()` can detect any retroactive edit. Covers 10 audit actions
(`EventCreated`, `EventDeleted`, `ChannelCreated`, `ChannelUpdated`,
`ChannelDeleted`, `MemberAdded`, `MemberRemoved`, `AuthSuccess`,
`AuthFailure`, `RateLimitExceeded`). It does not log `KIND_AUTH` events or
ephemeral events. In multi-community mode, audit chains are scoped per
community. Source:
[ARCHITECTURE.md §6 — buzz-audit](../ARCHITECTURE.md#6-crate-reference).

**Canvas** — a shared, editable document surface inside a channel (kind
`40100`, `KIND_CANVAS`) — for example, an architecture doc a "docs agent"
keeps updated after a refactor lands. Canvases, like messages, are signed
events, so edits carry the same identity and audit trail as chat. Source:
[ARCHITECTURE.md §2](../ARCHITECTURE.md#2-the-protocol),
[VISION_SOVEREIGN.md](../VISION_SOVEREIGN.md).

**Huddle** — real-time voice, implemented as a WebSocket Opus relay inside
`buzz-relay` (`src/audio/`) rather than a separate crate or external SFU. A
participant authenticates with a NIP-42 challenge, the relay checks channel
membership, then admits them to an in-memory room (soft cap 25 peers, hard
cap 255) and forwards opaque Opus frames between peers. The relay emits
Nostr events for participant joined/left and huddle-ended; when the last
peer leaves, the room ends and the channel archives atomically. Recording
and per-track publishing are reserved kinds with no producer built yet.
Source: [ARCHITECTURE.md §6 — Huddle Audio](../ARCHITECTURE.md#6-crate-reference).

**Workflow** — a channel-scoped, YAML-defined automation
(`buzz-workflow`), e.g. "on message containing `P1`, post a notice and
request approval from the author." Workflows have 4 trigger types
(`message_posted`, `reaction_added`, `schedule`, `webhook`) and 7 action
types (`send_message`, `send_dm`, `set_channel_topic`, `add_reaction`,
`call_webhook`, `request_approval`, `delay`). Approval gates
(`request_approval`) are defined but not yet fully wired for resumption as
of this writing — runs that hit one are marked failed (tracked as 🚧 WF-08
in `ARCHITECTURE.md`). Source:
[ARCHITECTURE.md §6 — buzz-workflow](../ARCHITECTURE.md#6-crate-reference).

**Blossom** — the blob-storage protocol Buzz uses for media (images, video,
files), backed by S3/MinIO. Uploads go through `PUT /media/upload` (50 MB
limit); `buzz-media` handles storage, validation, and thumbnail generation.
Source: [ARCHITECTURE.md — Architecture diagram](../ARCHITECTURE.md),
[ARCHITECTURE.md §6](../ARCHITECTURE.md#6-crate-reference) (`PUT /media/upload`).

**ACP (Agent Communication Protocol)** — the open, JSON-RPC-over-stdio
protocol ([agentclientprotocol.com](https://agentclientprotocol.com/)) Buzz
uses to drive AI coding agents (Goose, Codex, Claude Code, and Buzz's own
`buzz-agent`) as subprocesses. An ACP agent accepts `initialize`, then
`session/new` (returns a `sessionId`), then `session/prompt` (streams
`session/update` notifications and returns a `stopReason`). Source:
[`crates/buzz-acp/README.md`](../crates/buzz-acp/README.md),
[ARCHITECTURE.md §6 — buzz-acp](../ARCHITECTURE.md#6-crate-reference).

**ACP harness** — `buzz-acp`, the standalone binary that bridges Buzz relay
events to an ACP-speaking agent subprocess: it listens for `@mention` events
on the relay, batches and queues them per channel (at most one prompt
in-flight per channel), drives the agent over ACP, and the agent replies
using the Buzz CLI. Runs 1–32 agent subprocesses under one shared Nostr
identity. Source: [`crates/buzz-acp/README.md`](../crates/buzz-acp/README.md).

**Managed agent** — an ACP agent that Buzz Desktop spawns, supervises, and
restarts on the user's behalf (as opposed to a self-hosted `buzz-acp`
process run by hand on a server). Desktop resolves each managed agent's
runtime (`goose`, `claude`, `codex`, `buzz-agent`, a tier-2 preset, or a
tier-3 custom harness), effective command/args/env, and readiness before
spawning it. Source:
[`desktop/src-tauri/src/managed_agents/mod.rs`](../desktop/src-tauri/src/managed_agents/mod.rs)
and its `readiness.rs`/`discovery.rs` submodules.

**Persona** — a saved agent identity: a display name, avatar, system
prompt, model/runtime choice, and env vars, independent of any one running
process. A persona can be linked to one or more managed agent instances;
persona-level env vars are read live at spawn time, so editing a persona's
credentials takes effect on the next spawn without editing every agent that
uses it. Source:
[`desktop/src-tauri/src/managed_agents/personas.rs`](../desktop/src-tauri/src/managed_agents/personas.rs),
[`desktop/src-tauri/src/managed_agents/env_vars.rs:292-308`](../desktop/src-tauri/src/managed_agents/env_vars.rs).

**Persona Pack** — a portable, self-contained bundle (zip or git repo) that
defines one or more agent personas for deployment in Buzz: personas
(identity + system prompt), skills, MCP server config, pack-level
instructions, lifecycle hooks, and distribution metadata. A superset of the
[Open Plugin Spec](https://open-plugin-spec.org) — every valid Persona Pack
is a valid OPS package. Source:
[`crates/buzz-persona/PERSONA_PACK_SPEC.md`](../crates/buzz-persona/PERSONA_PACK_SPEC.md).

**buzz-cli** — the agent-first command-line interface to a Buzz relay: JSON
in, JSON out, designed for LLM tool calls. Mirrors and extends the MCP
surface (channels, messages, search, repo, upload, canvas operations) with
two-tier auth (NIP-98 keypair, or a dev-pubkey fallback). Source:
[`crates/buzz-cli/README.md`](../crates/buzz-cli/README.md),
[VISION.md](../VISION.md).

**buzz-dev-mcp** — the MCP server Buzz gives its coding agents for shell and
file-edit tools (multicall binary with personalities including a shell tool,
`rg`, `tree`, and the `git-credential-nostr`/`git-sign-nostr` helpers). On
Windows it requires Git for Windows (Git Bash) unless `BUZZ_SHELL` points at
another bash-compatible shell. Source:
[README — Windows prerequisites](../README.md#windows-prerequisites),
[`desktop/src-tauri/src/managed_agents/git_bash.rs`](../desktop/src-tauri/src/managed_agents/git_bash.rs).

**Git events (NIP-34)** — Buzz represents git activity (patches, repo
announcements, CI status) as signed Nostr events per NIP-34, so a feature
branch's patches, review, and merge decision live in the same channel and
search index as the chat about them. Source:
[README — "Branch as room"](../README.md#three-little-stories).

---

## DMs are not end-to-end encrypted — read this before you assume otherwise

It's a natural assumption that "Nostr DM" means end-to-end encrypted, the
way NIP-04/NIP-17 gift wrap is generally understood in the wider ecosystem.
**Buzz's own DM feature does not work that way.** This is important enough
to call out on its own rather than bury in the "channel" definition above.

What actually happens: the desktop app's `open_dm` command publishes a kind
`41010` event; the relay allocates a channel id for the DM and replies with
it in the `OK` message. From then on, DM messages are **ordinary kind `9`
events carrying an `#h` tag** pointing at that DM channel — structurally the
same event type as a normal channel message, not a NIP-04/NIP-44-encrypted
or NIP-17 gift-wrapped payload. Source:
[`desktop/src-tauri/src/commands/dms.rs:17-45`](../desktop/src-tauri/src/commands/dms.rs).

Kind `1059` (NIP-17 gift wrap) does exist in this codebase — the relay
accepts and stores it, and routes it through push delivery — but that
support exists **for third-party Nostr clients** connecting to a Buzz relay,
not for Buzz's own DM feature. In the Buzz Desktop app's own source
(`desktop/src-tauri/src`, `desktop/src`), kind `1059` appears only in a test
file and the e2e testing bridge, never in the code path that actually
builds a DM. Source: [NOSTR.md — NIP-29 Direct table](../NOSTR.md) ("NIP-17
DMs (gift wrap) ✅ ... Delivered via `#p`-filtered subscriptions"),
[`crates/buzz-core/src/kind.rs`](../crates/buzz-core/src/kind.rs) (`KIND_GIFT_WRAP: u32 = 1059`).

So what actually protects a Buzz DM's confidentiality? **Relay-side
authorization, not cryptography.** A DM channel is gated the same way any
private channel is — NIP-43 membership plus `#h` tag checks on reads — and
the relay stores every DM message in plaintext-readable form in Postgres,
the same as any other chat message. If you trust the relay operator with
your regular channel messages, that's the same level of trust a Buzz DM
requires; it is not a stronger guarantee.

NIP-44 (encrypted payloads) *is* used elsewhere in Buzz — just not for this.
Confirmed uses: self-encrypted personal state and agent core-memory
(NIP-AE "engrams," `crates/buzz-core/src/engram.rs`), agent-to-owner
traffic, and device-pairing payloads
(`crates/buzz-core/src/pairing/session.rs`). Separately, NIP-49 is used for
local, password-encrypted identity-key backup
(`desktop/src-tauri/src/key_backup.rs`) — a local file export, never
transmitted to a relay. Neither of these is the same thing as encrypting a
DM's content before it reaches the relay.
