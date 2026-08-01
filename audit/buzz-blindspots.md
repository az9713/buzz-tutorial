# Blindspot pass: the technical creation of Buzz

Generated 31 July 2026. Grounded in the clone at `C:\Users\simon\Downloads\buzz_me\buzz`
(main @ `10d5a2641`, 30 Jul 2026, 2,022 commits, 538 remote branches).

Written as a follow-on to two explainers (`how-buzz-works.html`, `what-is-nostr.html`)
that cover architectural reasoning and Nostr fundamentals. This document deliberately
covers what those do *not*.

Claims marked **[verified]** were re-checked directly against the repo rather than
taken from a subagent report.

---

## Core thesis

The two explainers describe the system's *reasoning* — the bet, the layering, the build
order — accurately. The blindspot is not a missing topic. It's a missing **layer**:
almost everything genuinely hard about Buzz lives one level below architectural
reasoning, in places where the clean story is deliberately violated to survive contact
with reality.

The one-sentence correction:

> **Buzz is not a relay with clients attached; it is a client with a relay attached, and
> the relay's clean invariants are held up by database triggers, a prompt file, and an
> author allowlist.**

---

## False framings to correct

### "Messages are end-to-end encrypted, or at least DMs are."

They are not. **[verified]** A Buzz DM is a relay-side channel: `open_dm` publishes a
`kind:41010` command, the relay allocates a channel id, and messages are ordinary
`kind:9` events with an `#h` tag (`desktop/src-tauri/src/commands/dms.rs:17-45`).

**The relay stores and can read every DM and every channel message.** Confidentiality is
enforced by relay-side authorization — NIP-43 membership and `#h` access checks — not by
cryptography. There is no NIP-04 anywhere in `crates/` **[verified]**, no NIP-44 on
message bodies, and no MLS in the tree. In the desktop client, `kind:1059` (gift wrap)
appears only in test files **[verified]** — the relay supports gift wraps for
*third-party* Nostr clients, but the Buzz app does not use them.

NIP-44 v2 *is* used, but only for four narrow things:

1. Self-encrypted personal state (read state, reminders, mutes)
2. Agent↔owner traffic (observer frames 24200, turn metrics 44200, engrams 30174)
3. Pairing payloads (24134)
4. NIP-49 key backup

This is the most important correction here, because a reader primed on Nostr's gift-wrap
story will assume the opposite.

### "An agent is just another keypair."

Nearly right, and the repo sharpens it into something better. An agent is a keypair
*with an attested owner*. NIP-OA (Owner Attestation) defines an `auth` tag by which an
owner key authorizes an agent key — and it explicitly refuses to reuse NIP-26's
semantics, because NIP-26 reassigns authorship to the delegator and "that semantic MUST
NOT be reused for agent provenance." The event stays authored by the agent.

NIP-OA has **67 code references, the most of any draft NIP** — it's the keystone. NIP-AA
then makes an agent's relay access *derivative*: revoke the human, and their agents fail
at next connect automatically.

The correct sentence is therefore "an agent is a keypair whose authority is borrowed and
revocable" — a stronger claim than the explainer makes.

### "The relay is the single source of truth, backed by Postgres."

True but too clean. There are read replicas with an LSN-based consistency fence, enforced
by a `DEFERRABLE INITIALLY DEFERRED` constraint trigger that re-evaluates
`clock_timestamp()` at COMMIT (not `now()`, which freezes at transaction start) and
aborts any channel-bearing insert whose `created_at` is older than a GUC-configured floor
(`migrations/0021_created_at_fence_floor.sql`). The header explains why: ingest checks
`|created_at - now| ≤ 900s` at acceptance, but acceptance and commit are separated by
unbounded async work, and several writers bypass ingest entirely.

### "ARCHITECTURE.md is the ground truth."

Both explainers lean on it, and it has drifted:

- It states rate limiting is unimplemented. `buzz-pubsub/src/rate_limiter.rs` has a
  working fixed-window Redis INCR+EXPIRE Lua script (human 60 msg/min, agent tiers to
  600), with a documented ⚠️ that fixed windows allow 2× burst at boundaries.
- It states `MAX_FRAME_BYTES = 65,536`. `config.rs:14` defaults `BUZZ_MAX_FRAME_BYTES`
  to 512 KiB.

When doc and code disagree here, the code is newer.

---

## Stack map

```
PRODUCT SURFACE      desktop (Tauri2+React19) · Flutter mobile · web · admin-web
                     ~419k lines desktop alone — the largest artifact in the repo
                            ↓ (274 #[tauri::command] IPC calls; two independent transports)
PROTOCOL             NIP-01 wire + 15 in-tree draft NIPs (6 of them agent-specific)
                            ↓
AGENT PLANE          buzz-acp (ACP/JSON-RPC over stdio) → goose/claude/codex/buzz-agent
                     auto-approved tool calls · per-channel queue · 1–32 process pool
                            ↓
RELAY                Axum · NIP-42 · 12-stage EVENT pipeline · 5-index DashMap fan-out
                            ↓
PERSISTENCE          Postgres 17 (partitioned, trigger-enforced invariants, read replicas)
                     Redis/Valkey (pub/sub — CURRENT BINDING CONSTRAINT)
                     S3/MinIO (Blossom blobs + git packs + manifest pointers)
                            ↓
FORMAL LAYER         4 machine-checked specs (1 unmerged) + Python bounded model checking
                            ↓
OPERATIONAL REALITY  ~3,100 communities/day · Redis load doubling every 3.45 days
                     4 private sibling repos hold build + deploy
```

---

## First-order blindspots

### 1. The client is the bigger half of the engineering

Desktop is ~302k lines of TS/TSX plus ~116k lines of Rust. The entire 26-crate server
workspace is ~244k lines of Rust. Mobile adds 80k Dart. The explainers are ~90% relay.

*Misconception:* the desktop app is a thin view over the relay.
*Reality:* it's a Tauri app with two entirely separate relay transports — a JS
long-lived WebSocket state machine (`relayClientSession.ts:71`, 16 ms event batching,
1s→30s reconnect backoff, 60s stall watchdog) running over a **Rust** socket plugin, *and*
a Rust-side one-shot HTTP bridge that NIP-98-signs every `/query` and `/events` call.
The shared `buzz-ws-client` crate is **not used by desktop at all** — only by `buzz-cli`
and `buzz-test-client`. Desktop reimplements NIP-42 auth separately.

**Prompt:** "Trace one desktop message send end-to-end: React component → Tauri IPC →
signing → which of the two transports → relay pipeline → fan-out → other client. Name the
layer boundary at each hop and what could silently fail there."

### 2. There is no human-in-the-loop gate on what an agent may do

**[verified]** `buzz-acp` auto-approves every `session/request_permission` from the agent
— it finds the `allow_once` option and returns it
(`crates/buzz-acp/src/acp.rs:1856-1859`; doc comment: *"Auto-approve a
`session/request_permission` request from the agent... If no `allow_once` option exists,
falls back to `reject_once`."*). There is no config knob to make it ask a human.

Meanwhile `queue.rs:1097-1109` splices Nostr event `content` **raw** into the prompt — no
escaping, no delimiting, no untrusted-data preamble — and attacker-controlled text sits in
the last, most-recent prompt position.

The chain: relay event → prompt → LLM → permission request → auto-approved → shell tool →
bash at operator privilege with `BUZZ_PRIVATE_KEY` in the environment. The entire security
argument rests on the *author* gate (`--respond-to owner-only`, fail-closed, plus
cryptographically verified NIP-OA sibling admission).

Sharpest detail: running Codex under Buzz injects `CODEX_CONFIG` enabling `network_access`,
which widens Codex's own macOS Seatbelt sandbox to full outbound TCP/TLS for *all* the
agent's subprocesses — because otherwise `buzz-cli` can't reach the relay
(`config.rs:721-772`). `VISION_AGENT.md:57` states the posture plainly: *"The shell runs
at the operator's trust level, like bash itself."*

Note the contrast: the repo *does* handle injection deliberately for MCP hook output
(JSON-encoded, labelled `[Post-compact hook output — untrusted]`), just not for Nostr
content.

**Prompt:** "Given that buzz-acp auto-approves tool permissions and splices event content
raw into prompts, enumerate the full attack path from a channel message to code execution,
then evaluate each existing mitigation (author gate, NIP-OA verification, filter
fail-closed, keyfile shim) for what it does and does not stop."

### 3. The formal methods are more honest — and prove less — than "TLA+ and Tamarin" suggests

Four things a one-paragraph treatment can't convey:

**(a) Bounds.** `MultiTenantRelay.cfg` runs 2 communities, 5 channels, 3 hosts — but
**1 actor and 1 worker**. Cross-pod and multi-actor races are structurally outside the
model. The conformance crate's `LIMITS.md` says the same independently: "The harness
traces one process."

**(b) A real vacuity bug shipped.** The Tamarin lemma
`other_community_key_compromise_does_not_authorize` bound `Neq(commA, commB)` to the same
timepoint as the compromise, but no rule emits `Neq` there — the premise was
unsatisfiable, so the lemma verified while asserting nothing. Found, fixed by decoupling
onto a witness timepoint, confirmed with an exists-trace probe. This is the best available
lesson that "machine-checked" can mean "checked nothing."

**(c) Non-vacuity is engineered in.** The TLA+ model ships intentionally-false probes
(`Probe_OpenAuthRegistration_Unreachable`, etc.) that must go red, plus 13 mutations
M1–M13 with confirmed counterexample trace depths.

**(d) The conformance gate defaults to `NoopTracer` in production**, and its read half is
not yet armed.

**Prompt:** "Read docs/spec/MultiTenantRelay.tla and its .cfg. State exactly what
Inv_NonInterference claims, what the model bounds exclude, and construct a concrete
production bug that would satisfy every invariant and still leak."

### 4. The load-bearing safety axiom of the multi-tenancy proof has no implementation

`docs/multi-tenant-relay.md` states axioms A-RLS-1..5 — every tenant-bearing table has
row-level security with a restrictive `community_id = current_setting('app.community_id')`
policy, request role `NOBYPASSRLS`, `SET LOCAL` before every query — and Theorem I4
(Fail-closed backstop) explicitly says *"removing the RLS guard makes the dropped
predicate produce a cross-label row — proving RLS load-bearing, not decorative."* The
Implementation Correspondence section claims *"every DB entry point takes `TenantContext`
and `SET LOCAL app.community_id`."*

**[verified]** Grepping `migrations/` and `crates/` for `ROW LEVEL SECURITY`,
`CREATE POLICY`, `SET LOCAL`, and `app.community_id` returns **zero occurrences**. The
only `current_setting` uses are two unrelated GUCs (`buzz.nip_rs_hard_delete`,
`buzz.created_at_floor`).

Isolation today is 100% application-level `WHERE community_id = $1` predicates with no
database backstop — exactly the failure mode I4 exists to cover.

In fairness: the doc is marked `draft`, and the conformance checklist lists RLS as a
**gate that must exist before multi-tenant mode is admitted**. But the newest commit on
main is `feat(relay): raise hosted community limit to five (#3829)`, and communities are
being created at ~3,100/day. The honest framing is a question, not an accusation: *is
multi-community shipping ahead of its own admission gate, or is the RLS suite in a private
deploy repo?*

**Prompt:** "Compare the axioms in docs/multi-tenant-relay.md against migrations/ and
crates/buzz-db/. For each axiom, mark it implemented / gated / absent, and say what breaks
first if it's absent."

### 5. The current binding constraint is Redis, and it's an active production incident

On the unmerged branch `origin/eva/redis-cluster-mode-spec` there is a **fourth** formal
spec (`RedisClusterFencingMigration.tla`, 9 mutants, all killed) and a doc that opens
with: Valkey executes one engine thread per node, "the deployed primary's engine core is
the relay's hard scaling ceiling, and it is filling on a measured doubling curve."

A commit on main folds in the incident analysis: onset moved 18:00Z→16:40Z, attributed to
organic community creation (58→425 in two hours), **~3,100 communities/day, 3.45-day
doubling, 5.2–9.0 day planning band**, watch metric is channels-per-community.

The killer structural fact: **classic Redis pub/sub broadcasts every message to every node
regardless of shard count**, so sharding does not help fan-out — converting to
`SPUBLISH`/`SSUBSCRIBE` is a prerequisite, not a detail.

The explainer's line that "Redis holds only what is allowed to be lost" is architecturally
right and operationally beside the point: it's the ceiling anyway.

**Prompt:** "Explain why sharding a Redis cluster does not reduce classic pub/sub load,
what sharded pub/sub changes, and what a fenced session directory is — then explain why
cluster mode forcing keys into one hash slot creates a live migration of fencing
authority."

### 6. Postgres is carrying correctness in triggers, not just in queries

Four examples, each worth understanding:

- The commit-time `created_at` floor guard (see "single source of truth" above).
- A NIP-RS hard-delete guard (`0011`) that raises unless the session sets
  `buzz.nip_rs_hard_delete='on'`, so a pre-upgrade binary gets its whole transaction
  aborted rather than silently skipping the rule during a rolling deploy.
- A deferred TTL-refresh trigger that takes `SELECT … FOR UPDATE` on the channel row
  before testing `ttl_seconds`, wrapped in `EXCEPTION WHEN OTHERS → RAISE WARNING` so a
  TTL failure can never reject a valid event.
- Constraint triggers cloned automatically onto new partitions so monthly rotation keeps
  the guard.

Also: tags are a JSONB column with a **`jsonb_path_ops`** GIN index (not the default
`jsonb_ops`, because only `@>` is used), added in migration `0004` whose header carries
the measurement that justified it — unindexed `#e` containment cost ~900 ms per hop, two
hops per scroll-back page, ~1.7 s of a ~2.1 s page. And FTS uses the **`'simple'`**
dictionary — no stemming, no stopwords — deliberately, to match prior Typesense-ish
semantics.

**Prompt:** "Read migrations/0021, 0022, and 0011. For each, state the race it closes, why
it had to be a database trigger rather than application code, and what a rolling deploy
would break without it."

### 7. Mobile is a full hand-reimplementation — including cryptography

234 Dart files, no FFI, no `flutter_rust_bridge`, no codegen. Kind constants are manually
synced, with a comment saying so: `mobile/lib/shared/relay/nostr_models.dart:7` — *"Keep
in sync with `desktop/src/shared/constants/kinds.ts`."*

**NIP-44 v2 is reimplemented from scratch in Dart on pointycastle**
(`mobile/lib/shared/crypto/nip44.dart`, 169 lines, plus its own `ecdh.dart` and
`hkdf.dart`); there is a `nip_oa_test.dart` but no NIP-44 test-vector file. Media
sanitization exists a *third* and *fourth* time in Swift (`MediaSanitizer.swift`) and
Kotlin (`AndroidMediaSanitizer.kt`), against 2,595 lines of Rust validation on the relay.

Set that against: **no `fuzz/` directory, no cargo-fuzz, no AFL, no loom, no miri, no
shuttle anywhere in the repo; proptest in 3 of 28 crates; criterion in zero.**

*Misconception:* buzz-core is the single source of truth for event verification.
*Reality:* the canonical serialization and the AEAD have multiple independent
implementations that must agree byte-for-byte or signatures and decryption break, and
nothing systematically tests that they do.

**Prompt:** "Design a differential test harness that proves the Rust and Dart NIP-44 v2
implementations agree, including the padding scheme and the HMAC, and say which classes of
bug it would still miss."

### 8. Push notifications are beautifully specified and not turned on

The design is genuinely novel: the protocol object is the *authorization* (a signed,
expiring, revocable filter — kind:30350 lease), not the transport artifact, inverting
notepush and the NIP-9a draft. The APNs body is a **compile-time constant** —
`{"aps":{"alert":{"body":"Reconnect to your relay now"},"mutable-content":1}}` — and the
relay's delivery request is `deny_unknown_fields`, so a relay attempting to send
notification text is *rejected, not ignored*. The gateway never sees the APNs token (it
resolves through encrypted DB state), enrollment uses Apple App Attest with a PEM-pinned
root, and there are two independent AEAD keyrings whose reuse is forbidden. Modeled in
Python by exhaustive bounded exploration with mutation testing (8 checked properties).

**And no client publishes a lease.** Grep for kind 30350 across desktop/mobile/web returns
zero. `AppDelegate.swift:17` requests only `[.badge]` and never calls
`registerForRemoteNotifications`. There are no notifications when the app isn't running,
on any platform. Six of 26 migrations are push infrastructure.

**Prompt:** "Explain the NIP-PL threat model: what does Apple learn, what does the gateway
learn, what does the relay learn, and what leaks regardless — then explain why timing and
frequency are explicitly conceded as unhideable."

### 9. Linking a second device copies your private key

NIP-AB is an 818-line spec with its own Tamarin proof, ephemeral ECDH, HKDF with three
domain-separated labels, a 128-byte transcript hash, constant-time comparison, and a
120-second session. The payload it transfers is `{"relayUrl", "pubkey", "nsec"}`
(`desktop/src-tauri/src/commands/pairing.rs:107-121`). No per-device subkeys, no NIP-46
remote signing — the spec states this as an accepted tradeoff.

The SAS is ~20 bits (6 digits) and is the *only* MITM defense. `NIP-AB.md:316` is blunt
that the source sends immediately after `sas-confirm` without waiting for an ack: *"The
transcript hash is a **detection** mechanism, not a prevention gate."* It cites Signal's
device-linking exploit as the motivating counterexample.

Pairing runs on a separate no-persistence, no-auth, loopback-bound sidecar relay
(`buzz-pair-relay`, MAX_CONNS 128, 6 events per connection) because a NIP-43
membership-gated relay can't admit an unpaired peer.

**Prompt:** "Walk NIP-AB step by step, then argue both sides: why 'device linking = key
copy' is defensible for this product, and what a subkey or NIP-46 design would cost and
buy."

### 10. There is no offline story, and "local-first" means exactly one CRDT

No outbox, no send queue, no `navigator.onLine` handling on any platform; publishes simply
throw after 25 s. No local message database anywhere — the desktop SQLite (`archive.db`)
is an opt-in "save this scope" archive that re-verifies against the relay before insert,
not a cache; mobile has no DB at all. The real cache is **localStorage**, 255 usages,
paint-then-revalidate; each community mounts a *fresh* React-Query client, so switching
communities starts cold and the snapshot exists purely to hide that.

The one genuine CRDT is NIP-RS read state: grow-only max registers merged by `max()`, with
each *client installation* owning its own `d = read-state:<slot-id>` coordinate so two
devices never write the same address, plus a mandatory slot rotation if a `client_id`
mismatch is detected. Mark-as-unread is deliberately impossible — the merge rule is
monotonic by design.

**Prompt:** "Explain why NIP-RS chose per-installation slots plus max-merge over a single
shared coordinate, and what product feature that choice permanently forecloses."

### 11. The most interesting systems work in the repo is the git layer

Three independent mechanisms:

**(a) git-on-object-storage** — git hosting with *no persistent filesystem*. Content is
create-only content-addressed packs, and a repo's entire ref state is one mutable manifest
pointer advanced by S3 conditional PUT. Every request hydrates an ephemeral tree, shells
out to git, and drops it. Three theorems (durability-ordering, manifest reconstruction,
linearizable refs), eight invariants, TLA+ with 3 concurrent pushers. The intellectual
claim is precise and unusually humble: the *algorithm* isn't novel — it's git's
post-reftable model with `rename()` swapped for a conditional PUT — the contribution is
the formal characterization, which is **parametric over the atomic primitive** and admits
a backend by empirical probe because "a finite probe cannot prove a universal axiom." The
bug it was built to kill is named in-spec: the fallible-snapshot skip,
`MustPublish == DidChange ∨ snapErr` — never treat a failed read as "no change."

**(b) git-sign-nostr** — your npub *is* your commit signing key, via git's
`gpg.x509.program` hook and GPG's status-fd CLI contract; it can carry a NIP-OA tag so an
agent's commits prove which human authorized them.

**(c) git-credential-nostr** — NIP-98 replaces the PAT; requires git ≥2.46 for the
`authtype` capability.

The repo dogfoods all of it — commits carry
`Signed-off-by: npub1…@buzz.block.builderlab.xyz`.

**Prompt:** "Explain the manifest-pointer CAS scheme as if to someone who knows git but not
S3 semantics, then explain why the proof is stated as parametric over the atomic primitive
and what that buys."

### 12. The agent failure modes are documented with rare candor, and the core one is still open

`docs/welcome-kickoff-silent-failures.md`, 502 lines, is the most honest document in the
repo. Its thesis: *"the kickoff decides what to say from a timer and the absence of
evidence, then writes that guess in permanent ink… The facts decorate; the timers
decide."*

The distinction it names — **"the agent crashed" is a fact; "no intro yet" is ignorance,
and announcing ignorance on a deadline produces the wrong story** — is transferable well
beyond this codebase.

It documents a runaway agent-to-agent reply loop caused by two prompt rules composing into
perpetual motion (every turn MUST publish; when done you MUST @mention the delegator), and
observes that *"'Don't get into a loop' is not a rule an agent can follow"* — a loop is a
global property, each agent sees only its own turn — so it had to become a local per-turn
test. The fix is visible in the shipped `base_prompt.md`.

But the doc is explicit that **there is still no reply-depth counter, hop limit, cooldown,
or agent-to-agent budget anywhere in the path**, and it enumerates and dismisses every
existing guard. Meanwhile the *opposite* failure — an agent doing real work and ending the
turn without publishing, so the result is thrown away — is being fixed on an unmerged
branch via `BUZZ_AGENT_REQUIRE_REPLY`, defaulted on for small local mesh models,
"advisory, never a trap," at most two reminders.

Both failure modes are live, they pull in opposite directions, and neither is in the
explainers.

**Prompt:** "Read docs/welcome-kickoff-silent-failures.md. Extract the general design
principles about timers-as-evidence and local-vs-global rules, then design a reply-depth
circuit breaker that doesn't misfire on a legitimately long agent chain."

---

## Orthogonal dimensions worth analyzing separately

Beyond the two the explainers cover well (protocol design; architectural layering):

| Dimension | Why it's independent | What you'd learn |
|---|---|---|
| Cryptographic implementation | Distinct from protocol design | Three implementations of NIP-44/NIP-01 must agree; nothing tests that they do |
| Adversarial / trust boundary | Distinct from access control | The agent plane is the soft spot, not the relay |
| Operational load | Distinct from architecture | Redis is the ceiling; growth is exponential |
| Verification epistemics | Distinct from "we used TLA+" | Bounds, vacuity, and arming determine what a proof means |
| Doc-vs-code drift | Distinct from either | ARCHITECTURE.md and the RLS axioms both drift |
| Client engineering | Distinct from server | Larger than the server; 4 reimplementations |
| Release & supply chain | Distinct from build | 5 repos, 4 justified advisory ignores, `evalexpr` pinned <13 because v13 relicensed MIT→AGPL |
| Governance | Distinct from licensing | `GOVERNANCE.md` is one line pointing at Block's OSPO; support matrix is `main` only |

---

## Minimum high-yield prompt set

If you run only five:

1. **"Which parts of Buzz are encrypted, which are only authorized, and where exactly is
   the boundary?"** → kills the biggest false framing.
2. **"Trace the path from an untrusted Nostr event to shell execution in buzz-acp, and
   evaluate every mitigation on that path."** → the sharpest live risk.
3. **"For each of the four formal specs, state what is proven, under what bounds, and give
   a real bug it would not catch."** → converts "formally verified" from a badge into a
   claim you can size.
4. **"What is the current binding constraint on the deployed system, and what is the
   evidence?"** → surfaces the Redis/Valkey incident and the growth math.
5. **"Compare the desktop, mobile, and relay implementations of event construction and
   NIP-44. Where must they agree byte-for-byte, and what tests that?"** → the client half
   plus the crypto-duplication risk.

### What gets missed if you skip them

Skip #1 and you'll describe Buzz's privacy properties wrongly in public — the most likely
way to embarrass yourself with this material. Skip #2 and you'll present the agent design
as the system's strength while missing that it's the least-defended surface. Skip #3/#4
and "machine-checked" becomes a thought-terminating credential; you'll also miss that a
documented vacuity bug is the single best teaching example in the repo. Skip #5 and you'll
keep the "one relay, thin clients" mental model, which is wrong by line count and wrong
about where bugs will come from. Skip the Redis question and you'll analyze a 2026-Q1
architecture while the team fights a 3.45-day doubling curve.

---

## Rat-hole warning

**Do not start with the 15 draft NIPs, the kind-number registry, or the crate dependency
graph.** They are legible, enumerable, and feel like progress — and the explainers already
cover them. Two of the fifteen (NIP-AA, NIP-MP) have **zero code references**; NIP-AO has
one, NIP-WP has two. Reading all fifteen equally weights paper and production.

Also a rat hole: the Tauri/WebKitGTK Linux rendering issues. Genuinely well-diagnosed (a
FreeType 2.11→2.13 struct-layout change growing `FT_ColorStopIterator` 16→20 bytes and
corrupting Skia's color-stop arithmetic; the fix raised the glibc floor 2.35→2.39 and
dropped Ubuntu 22.04 AppImage users). Fascinating, zero leverage on understanding the
system.

The dominant game:

```
what is actually trusted  →  what enforces it (crypto? SQL predicate? prompt? allowlist?)
  →  what proves the enforcement (test? trigger? bounded model? nothing?)
  →  what is currently binding in production
  →  what you would build differently
```

Your first useful target is the **trust map**: for each of message content, channel
membership, tenant isolation, agent authority, and media access, name the single mechanism
that enforces it and the single artifact that verifies it. Four of those five have
surprising answers.

---

## Acceptance tests — how you'll know you're no longer blind

- You can state which Buzz data is encrypted and which is merely authorized, without
  hedging.
- You can explain why NIP-OA deliberately rejects NIP-26 semantics.
- You can name the model bound that makes the TLA+ relay proof silent about cross-pod
  races.
- You can say what the current scaling ceiling is and why sharding doesn't fix it.
- You can explain, unprompted, why "don't get into a loop" is not an instruction an agent
  can follow.

---

## Master prompt

> I'm studying the Buzz codebase (github.com/block/buzz) — a self-hostable Nostr relay
> that doubles as a human/AI-agent workspace: 26-crate Rust workspace, Axum relay,
> Postgres with partitioning and trigger-enforced invariants, Redis pub/sub, S3/Blossom
> media, Tauri+React desktop (~419k lines), Flutter mobile (~80k, no shared code), an ACP
> agent harness, four machine-checked formal specs, and 15 draft NIPs.
>
> I already understand the architectural reasoning and Nostr fundamentals. Do not
> re-explain those. Instead, for the area I name below, work at the implementation layer
> and answer:
>
> 1. What invariant is claimed, and where is it *actually* enforced — cryptography, a SQL
>    predicate, a database trigger, a type-level fence, a prompt file, or an allowlist?
> 2. What verifies that enforcement, and what are that verification's explicit bounds?
> 3. Where do the docs and the code disagree, and which is newer?
> 4. What is the honest failure mode, including anything the repo's own comments admit is
>    unbuilt?
>
> Cite files and line numbers. Separate "the repo says X" from "my inference." If
> something is specified but has zero code references, say so.
>
> Area: `<X>`

## Next best prompt — run this one first

> Across the Buzz repo, build a trust map. For each of: (a) channel message content,
> (b) DM content, (c) channel membership, (d) cross-community tenant isolation, (e) agent
> authority to act, and (f) media blob access — name the single mechanism that actually
> enforces it, the artifact that verifies that mechanism, and whether that verification is
> armed in production by default. Flag every case where the enforcing mechanism is weaker
> than a reader of ARCHITECTURE.md would assume.

---

## Note on this pass

One subagent's report tripped an instruction-shaped-pattern filter, solely because the
repo contains permission-mode string literals (`bypassPermissions`, `dontAsk`) in
`crates/buzz-acp/src/config.rs`. That's repo content being reported on, not anything that
influenced behavior.

The RLS finding, the DM finding, the NIP-04 absence, and the auto-approve behavior were
each re-verified directly against the repo rather than taken on report.
