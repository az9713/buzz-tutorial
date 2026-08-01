# Phase 0 log — cartography, tooling, and calibration setup

Run date: 2026-07-31 / 2026-08-01. Target: `buzz/` @ `b1b283cd4`, clean tree.
This is the raw record; the advisory summarises it.

---

## 0.1 Skill search

```
npx skills find nostr protocol security
npx skills find static analysis rust
```

**Installed:** `soapbox-pub/nostr-skills@nostr` → `.agents/skills/nostr`.

**Assessment: low value.** The skill is a pointer, not knowledge — it tells the
reader to fetch NIPs from `github.com/nostr-protocol/nips`. The repo ships its
own `docs/nips/` (17 files) plus `NOSTR.md` and `SECURITY.md`, which are better
ground truth for *this* implementation than the upstream spec. The audit agents
were given Nostr threat-model context directly in their prompts instead.

**Not installed, with reasons:**

| Candidate | Why skipped |
|---|---|
| `athola/claude-night-market@rust-review` | Generic Rust review checklist; the Phase 2 lens prompts already cover it, and `cargo clippy` is the real tool |
| `mohitmishra786/low-level-dev-skills@static-analysis` | Wraps tooling we invoke directly |
| `aibtcdev/skills@nostr`, `purrgrammer/grimoire@nostr-tools` | Implementation helpers for *writing* Nostr code, not auditing it |

---

## 0.2 Static analysis — what ran, what it found, and where it is blind

### `cargo audit` — 4 vulnerabilities, 6 warnings

| Advisory | Crate | Severity | Title |
|---|---|---|---|
| RUSTSEC-2026-0194 | quick-xml 0.38.4 **and** 0.39.4 | 7.5 high | Quadratic run time checking a start tag for duplicate attribute names |
| RUSTSEC-2026-0195 | quick-xml 0.38.4 **and** 0.39.4 | 7.5 high | Unbounded namespace-declaration allocation in `NsReader` → memory-exhaustion DoS |

Both fixed in quick-xml ≥ 0.41.0. Note **two versions of quick-xml are in the
tree simultaneously**, so a single bump will not clear it.

Warnings: `instant 0.1.13` unmaintained (RUSTSEC-2024-0384), `paste 1.0.15`
unmaintained (RUSTSEC-2024-0436), `event-listener 5.4.1` unsound
(RUSTSEC-2026-0221, `!Send` tags crossing thread boundaries via `StackSlot`),
and three yanked crates: `async-utility 0.3.1`, `spin 0.9.8`, `spin 0.10.0`.

### `cargo clippy --workspace --all-targets` — **zero warnings**

The workspace is clippy-clean on default lints, almost certainly CI-enforced.
This is good hygiene but it means **default clippy provided no ground truth at
all**. Re-run on the nine security-relevant crates with lints CI would not gate
on:

```
-W clippy::indexing_slicing -W clippy::arithmetic_side_effects
-W clippy::cast_possible_truncation -W clippy::cast_sign_loss
-W clippy::unwrap_used -W clippy::panic_in_result_fn -W clippy::integer_division
```

→ **795 hits**: 368 arithmetic-with-side-effects, 204 "indexing may panic",
67 truncating casts, 57 "slicing may panic", 22 `unwrap` on an `Option`/`Result`,
6 integer divisions, plus assorted. These are *not* findings — they are lint
classes, mostly benign. They are used only as **Gate C corroboration**: an agent
finding that lands within 5 lines of one of these carries independent evidence.

### `pnpm audit --prod` — 1 moderate

`npm audit` fails on this repo (`ENOLOCK`; it is a pnpm workspace). Via
`pnpm@11.4.0`, across 478 dependencies (442 prod, 36 optional):

- **GHSA-6v5v-wf23-fmfq** — `markdown-it ≤ 14.1.1`, quadratic-complexity DoS in
  the smartquotes rule (CWE-400/407). Reached twice through
  `desktop > tiptap-markdown > markdown-it` and
  `desktop > tiptap-markdown > prosemirror-markdown > markdown-it`. Fixed in
  14.1.2. This is a *message renderer* parsing attacker-authored content, so
  reachability is plausible and worth Phase 3 attention.

### `semgrep --config auto` — 146 hits, 683 rules, 2,953 files

First run crashed on Windows writing UTF-8 output through a cp1252 codec;
re-run with `PYTHONUTF8=1`.

110 of the 146 are one rule, `detect-insecure-websocket` (`ws://`), overwhelmingly
localhost and test fixtures. The remainder worth seeding:

| Rule | Location |
|---|---|
| `detected-private-key` | `desktop/src-tauri/src/commands/agent_discovery/install_report_redaction_tests.rs:306` |
| `detected-telegram-bot-api-key` | `docs/nips/NIP-MP.fixtures.json:1250` |
| `detected-generic-secret` | `desktop/src/shared/ui/styled-qr-code.test.mjs:9`, `desktop/src/testing/e2eBridge.ts:12011` |
| `incomplete-sanitization` | `desktop/src/features/profile/ui/ProfileAvatarEditor.utils.ts:357` |
| `detect-replaceall-sanitization` | `desktop/src/features/messages/lib/agentSnapshotClipboard.ts:23` (×4) |
| `detect-non-literal-regexp` | `mentionPattern.ts:36,43`, `customEmojiNode.ts:101`, `hasMention.ts:145`, `mentionHighlightExtension.ts:109,124`, `remarkCustomEmoji.ts:44`, `detectPrefixQuery.ts:34` — user-controlled input compiled into regexes is a ReDoS surface |
| `ifs-tampering` | `scripts/build-sprig.sh:122`, `scripts/post-screenshots.sh:83` |

**The blind spots matter more than the hits.** Semgrep's `auto` config has
essentially **no Rust security rules** (its Rust output here is the websocket
rule alone) and **no Dart rules at all**. So:

- `crates/` (384 files) rests on `cargo clippy` plus model reading.
- `mobile/lib` (234 Dart files) has **no static analysis whatsoever** — model
  reading only. This is the audit's weakest evidentiary ground and the advisory
  must say so.

**Tool index:** 941 hits (146 semgrep + 795 clippy) across 157 files were indexed
by `file:line` (`tool_index.py`) so any agent finding can be checked for
independent tool corroboration within ±5 lines.

---

## 0.3 Graphify — and how it changed the plan

Scope: `crates/` + `desktop/src-tauri/` = 597 code files → **20,140 nodes,
53,273 edges, 695 communities** (AST-structural pass; the LLM semantic pass was
skipped to stay in the time box). Output in `graphify-out/`.

The full corpus (3,236 files, ~3.65M words) is far past graphify's practical
thresholds, so `desktop/src`, `mobile/`, and `web/` were left out of the graph.
Their slicing therefore rests on directory structure, which is a stated weakness.

### Highest-blast-radius files

| Degree | Node | File |
|---|---|---|
| 255 | `builders.rs` (incl. `sign()`) | `crates/buzz-sdk/src/builders.rs` |
| 243 | `Db` | `crates/buzz-db/src/lib.rs` |
| 234 | `llm.rs` | `crates/buzz-agent/src/llm.rs` |
| 213 | `handlers::ingest` | `crates/buzz-relay/src/handlers/ingest.rs` |
| 199 | `pool.rs` | `crates/buzz-acp/src/pool.rs` |

### Coupling that directory names hide

- `ingest_event_inner()` in `crates/buzz-relay/src/handlers/ingest.rs` makes its
  privilege-relevant kind checks — `is_relay_admin_kind()`,
  `is_identity_archive_request_kind()` — by calling into
  `crates/buzz-core/src/kind.rs`. A crate-scoped review of the relay would read
  only half of its own admission logic.
- `buzz-auth` ↔ `buzz-pubsub` form one 49-node community: pub/sub is *entangled
  with* auth rather than merely downstream of it. Both crates independently
  contain a `nip98_replay.rs`.
- `buzz-dev-mcp` ↔ `buzz-relay` ↔ `desktop/src-tauri/src/egress_guard.rs`: a
  developer/MCP tooling crate sits in the same community as the relay's network
  **egress guard**.
- `desktop/src-tauri/src/commands/` and `managed_agents/` are heavily co-mingled.
- **205 `#[tauri::command]` handlers across 76 files.** The surface is not
  uniform: 17 command files reach `buzz-core`, and 8 reach `buzz-sdk` and can
  therefore drive `sign()`.

### Changes graphify forced on the provisional plan

1. **`crates/buzz-auth` was missing from the plan's slice table entirely** —
   nine files containing NIP-42, NIP-98, replay defence, scopes, and rate
   limiting. Now a depth slice. (Found by file census, confirmed by graphify's
   auth↔pubsub community.)
2. `crates/buzz-db` promoted breadth → depth, and `crates/buzz-sdk` pulled out of
   a catch-all breadth slice to join it, on centrality grounds.
3. `desktop/src-tauri` split: `commands/` (the IPC trust boundary) became its own
   depth slice, separate from the rest of the backend.
4. About **100 crate files** the provisional table never assigned — `buzz-pubsub`,
   `buzz-relay-mesh`, `buzz-persona`, `buzz-voice`, `buzz-audit`, `buzz-workflow`,
   `buzz-search`, `buzz-ws-client`, `git-credential-nostr`, `git-sign-nostr`,
   `buzz-pairing-cli`, `buzz-admin`, `sprig` — were given owners.
5. `mobile/ios` and `mobile/android` (94 files: entitlements, `Info.plist`,
   `AndroidManifest` permissions, exported components, deep-link intent filters)
   added to the mobile slice. The plan had Dart only.

---

## Final slice list

**17 breadth slices** (one Sonnet 5 agent each) → **9 of them also depth slices**
(3 Fable 5 lenses each: hostile input / crypto+identity / correctness) = **44 agents**.

| Tier | Slice | Files |
|---|---|---|
| depth | relay | 79 |
| depth | core | 24 |
| depth | auth (`buzz-auth` + `buzz-acp`) | 26 |
| depth | media | 27 |
| depth | tauri-commands | 97 |
| depth | db (`buzz-db` + `migrations` + `buzz-sdk`) | 56 |
| depth | desktop-shared | 328 |
| depth | desktop-messages | 367 |
| depth | mobile (Dart + iOS + Android) | 330 |
| breadth | gateway-mesh | 40 |
| breadth | agent-surface | 52 |
| breadth | tooling-identity | 106 |
| breadth | tauri-core | 183 |
| breadth | desktop-agents | 322 |
| breadth | desktop-rest | 604 |
| breadth | web (+ admin-web) | 58 |
| breadth | supply-chain | 205 |

**Assigned: 2,904 of 3,435 tracked files (84.5%).**

Unassigned 531, all deliberate: `desktop/tests` (149) and `mobile/test` (97) are
read by the Phase 4 critic as evidence of the project's own threat model but not
audited for vulnerabilities; `desktop/src-tauri` non-source (74: icons,
resources); `benchmarks/` (40); `docs/` (41); `examples/` (10); assets (15);
agent-config files (~6).

---

## 0.4 Calibration harness

### Gate A — mechanical evidence check (`gate_a.py`, zero tokens)

Every finding carries an `evidence` field. Before any verification token is
spent, a script checks that the file exists, that the quoted evidence actually
appears in it (whitespace-normalised), and that it appears within ±10 lines of
the claimed line. Failures are dropped as hallucination and counted — that count
is the audit's raw hallucination rate. Self-checked with a `--test` mode that
asserts invented files, invented code, and wrong line numbers are all rejected
while re-indented real code is accepted.

### Gate B — cross-model verification

Status pending; the plan's fallback (state that findings are Claude-verified
only, and that the correlated-error caveat applies in full) is in force unless
Codex authentication is confirmed.

### Gate C — corroboration index (`tool_index.py`)

941 tool hits indexed by file:line, so a critical/high finding can be checked for
independent static-analysis agreement.

### Planted-bug canary (recall)

442 files (`crates/buzz-{relay,core,auth,acp,media}`, `web/src`, `mobile/lib`)
copied to a scratch tree; 10 synthetic defects of known type and location planted
across Rust, TypeScript, and Dart at three difficulty levels. Breadth agents
sweep the copy blind; the fraction recovered is the recall estimate.
**First planting agent stalled with zero edits after ~60 minutes and was
replaced** — recorded here because it delayed the calibration, not the audit.

### Historical backtest (the only test with verified ground truth)

Commit `047533c56` — *"fix(mobile): keep TLS on relays joined by invite"* — is a
real, documented security fix. Before it, `RelayConfig.baseUrl` was stored as
`wss://…` by the invite-join path but as `https://…` by the pairing path, while
the socket getter read:

```dart
final scheme = uri.scheme == 'https' ? 'wss' : 'ws';   // 'wss' is not 'https'
```

so a `wss://` origin fell through to plaintext `ws://` — a **silent TLS
downgrade** after `validateInviteRelayUri` had insisted on `wss://`, also
malforming `/query`, media upload, and Blossom auth requests built from the same
value.

29 Dart files from the **parent** commit were extracted to a scratch tree and one
agent was pointed at them blind, told only to look at transport security and
onboarding input handling. Whether it rediscovers the downgrade is the single
result in this audit measured against a known answer.

---

## Addendum — cartography reproducibility

The graphify agent, having lost track of run state, re-ran the entire Phase 0.3
cartography from scratch late in the session. It produced **identical** numbers:
597 code files, 20,140 nodes, 53,273 edges, 695 communities, the same god-node
ranking, and the same `buzz-auth` ↔ `buzz-pubsub` and
`buzz-dev-mcp` ↔ `buzz-relay` ↔ `egress_guard.rs` couplings.

Unplanned, but it is a free reproducibility check: the structural analysis the
slice list was built on is deterministic and not an artefact of one run. The
duplicate run was stopped once noticed; its only cost was tokens.

---

## Correction — the Tauri backend was outside the static-analysis scope

**The Phase 0.2 claim "the workspace is clippy-clean" was too broad, and the
completeness critics caught it.**

The root `Cargo.toml:32` contains `exclude = ["desktop/src-tauri"]`, and
`desktop/src-tauri/Cargo.toml` declares its own `[workspace]`. So
`cargo clippy --workspace` and `cargo audit` at the repo root never analysed the
Tauri backend's **354 Rust files** — which is where the repo's `unsafe` blocks
actually live (`managed_agents/runtime/instance_reaper.rs`,
`managed_agents/process_lifecycle.rs`,
`commands/agent_discovery/install_exec.rs`, `commands/media.rs`, and others).

Re-run inside `desktop/src-tauri/` after the fact:

**`cargo audit` — ran successfully** (it reads the lockfile and needs no build):

- RUSTSEC-2026-0194 and RUSTSEC-2026-0195, `quick-xml 0.38.4` — the same two
  high-severity DoS advisories as the main workspace (availability impact, fixed
  in ≥ 0.41.0).
- Three warnings the main workspace does **not** have:
  `unic-ucd-version 0.9.0` unmaintained (RUSTSEC-2025-0098), `glib 0.18.5`
  unsound (RUSTSEC-2024-0429), `event-listener 5.4.1` unsound (RUSTSEC-2026-0221).
- Plus yanked `async-utility 0.3.1`, `spin 0.9.8`, `spin 0.10.0`.

**`cargo clippy` — could not run.** The build fails before analysis:

```
error: failed to run custom build command for `buzz-desktop v0.5.3`
  panicked at build.rs:136: failed to build Tauri application:
  resource path `binaries\buzz-acp-x86_64-pc-windows-msvc.exe` doesn't exist
error: failed to run custom build command for `audiopus_sys v0.2.2`
  CMake Error at CMakeLists.txt:7 (project)
```

Two independent blockers: a prebuilt `buzz-acp` sidecar binary that is not in the
tree, and a missing CMake toolchain for `audiopus_sys`. The plan's declared
fallback is `cargo check`, but that also executes `build.rs` and fails
identically. Producing the sidecar would mean writing into `buzz/binaries/`,
which the read-only-clone rule forbids.

**Consequence, stated plainly:** the 354 Rust files of the Tauri backend —
including every `unsafe` block in the repository and the ~37,000-line
`managed_agents/` subsystem — have **no lint coverage whatsoever**. Their only
scrutiny in this audit is model reading, and the completeness critics
independently judged `managed_agents/` "essentially unexamined" even by that
standard. Dependency scanning did reach them; lint analysis did not.
