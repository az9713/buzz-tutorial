# buzz — security and quality audit advisory

**Target:** `buzz` @ commit `b1b283cd4`, clean working tree. 3,435 tracked files;
Rust, TypeScript, Dart, plus shell and YAML.
**Date:** 2026-07-31 / 2026-08-01.
**Nature:** advisory only. We do not own this repository, nothing in it was
modified, and no patches are proposed as diffs.

---

## Read this part first

This audit was performed by language models reading code. That method has a
specific, measurable failure profile, and this section states it before any
finding, because the findings should be read through it.

**What we measured about ourselves:**

| Question | Answer | How we know |
|---|---|---|
| Do the findings cite code that actually exists? | **Yes — 198/199 (99.5%)** | Gate A: a script checked every quoted `evidence` string against the file. 1 finding invented code and was deleted. |
| Are the reporters' severity labels trustworthy? | **No.** | Of the 27 findings that survived verification, reporters claimed 1 critical and 20 high. Verifiers rescored the same findings to **0 critical and 4 high**. |
| How many findings survive an adversarial re-read? | **27 of 48 (56%)** | 3 independent verifiers per finding, instructed to refute by default; 2-of-3 needed to survive. |
| Would this method find a bug it wasn't told about? | **Sometimes. 4 of 10.** | Planted-defect canary — see Calibration. |
| Did static analysis independently corroborate the findings? | **Almost never — 11 of 198.** | ~94% of what reached verification rests on model reading alone. |
| Was cross-model verification obtained? | **No.** | Gate B failed. See below. |

**The single most important caveat.** Findings and verifiers were all Claude
models. Their errors are *correlated*: a misreading that feels natural to one is
likely to feel natural to the next, so three verifiers can agree on a wrong answer
with high confidence. The plan's defence against this was Gate B — independent
re-verification by a different model family (GPT-5 via the Codex CLI). **Gate B
did not run.** The CLI authenticated and answered two smoke tests, then the
account hit its usage limit ("try again at Aug 7th") and every one of the 9
verification batches returned empty output. All 27 findings below are
**Claude-verified only**, and the correlated-error caveat applies to them in full.

**"No findings" never means "no bugs."** See Calibration and Coverage gaps. Several
slices returned little because they were barely read, not because they were clean.

---

## What actually ran

| Phase | Work | Result |
|---|---|---|
| 0 | Cartography: skill search, static analysis, graphify knowledge graph | Reshaped the slice list — see below |
| 1 | Breadth sweep, 17 slices, 1 Sonnet 5 agent each | Every slice covered |
| 2 | Depth dives, 9 risk slices × 3 lenses, Fable 5 at high effort | 27 agents |
| Gate A | Mechanical evidence check, zero tokens | 198/199 passed |
| 3 | Adversarial verification, 12 batches × 3 refute-by-default lenses | 27 survived, 21 refuted |
| 4 | Completeness critics × 3 | 50 coverage gaps |
| Gate B | Cross-model verification | **Failed — quota exhausted** |

**44 agents in the sweep, 39 in verification, 0 errors.** 2,904 of 3,435 tracked
files (84.5%) were assigned to a slice. The 531 unassigned are listed in
"What was never in scope".

### Phase 0 changed the plan in ways worth knowing

Cartography ran *before* any auditor, specifically so that slices would follow
real coupling rather than directory names. It caught three things the provisional
plan had wrong:

1. **`crates/buzz-auth` was missing from the audit scope entirely** — nine files
   containing NIP-42 relay auth, NIP-98 HTTP auth, replay defence, scopes, and
   rate limiting. It was promoted to a depth slice.
2. **About 100 further crate files had no owner**, including
   `git-credential-nostr` and `git-sign-nostr` (which touch real credentials and
   signing) and `buzz-audit` (the tamper-evidence log).
3. **Centrality analysis** (20,140 nodes, 53,273 edges over 597 Rust files) named
   `crates/buzz-sdk/src/builders.rs` (containing `sign()`) and
   `crates/buzz-db/src/lib.rs` as the two widest-blast-radius files in the Rust
   scope. Both were in breadth-only slices; both were promoted to depth.

It also found that `ingest_event_inner()` in the relay makes its privilege
decisions by calling `is_relay_admin_kind()` in **`buzz-core`** — so a
crate-scoped review of the relay would read only half of its own admission logic.

---

## Calibration — how well does this method actually work?

### Recall: 4 of 10 planted defects (4/10)

Ten synthetic defects of known type and location were planted in a scratch copy
of 442 files (never in the real repository), and the breadth pass swept it blind.

| Difficulty | Found |
|---|---|
| Easy (visible when skimming) | 2/3 |
| Medium (needs the enclosing function) | **0/4** |
| Hard (one-token change / absent check) | 2/3 |

**The 0/4 on medium is the result that matters.** The agent auditing
`crates/buzz-auth` reported reading all eight of its files *in full* and concluded
"this crate is small and well-tested; no findings there" — while two planted
defects sat in the files it had just read. The media agent did the same: read
`validation.rs` and `upload.rs` completely, missed both planted defects, and
reported two different issues instead.

**"The agent read the file" and "the agent would have caught a bug in the file"
are separate claims, and only the first is supported by this evidence.**

The defects it did catch were ones that look wrong in isolation — a match arm
swallowing a rate-limit denial, `is_verified()` hardcoded to `true`,
`allow-same-origin` added to an iframe sandbox. The ones it missed were all of the
form *"this value is plausible but it is the wrong value"* — a swapped size cap, a
swapped Redis key suffix, an inverted boolean. Those require holding the intended
semantics in mind, not just reading the line.

Two caveats make 40% an **upper bound**: a defect counts as found if any finding
lands within 15 lines of it, which is generous; and synthetic defects are easier
than real ones.

### Backtest: the depth tier rediscovered a real vulnerability

Commit `047533c56` fixed a genuine silent TLS downgrade. 29 Dart files from its
**parent** commit were extracted and one depth agent was pointed at them blind,
told only to look at transport security and onboarding input.

Its first finding, ranked critical, was the real bug:

> `RelayConfig.wsUrl` silently downgrades TLS for every community joined by
> invite link. The scheme test only recognises `'https'`, but the invite path
> persists `'wss://host'`, so `'wss'` falls into the else branch and the socket is
> opened as plaintext `'ws://'`.

Exact file, exact line (`relay_provider.dart:21`), correct mechanism. It traced
the full path and independently noted the detail that makes the bug dangerous in
practice: the invite claim itself succeeds over HTTPS, so nothing warns the user,
and the plaintext socket then carries the NIP-42 AUTH event signed with the
member's private key.

**Breadth and depth are not equally powerful, and this audit should not be
summarised with one recall number.** Breadth (Sonnet, one pass, read-broadly
instructions) got 40% on synthetic defects. Depth (Fable at high effort, instructed
to trace data flow *across* files) found a real one. An empty breadth slice is weak
evidence; an empty depth slice is somewhat stronger; neither is an all-clear.

---

## Confirmed findings

27 findings survived: **4 high, 12 medium, 11 low. No critical finding survived verification.**

Ranked below by value per unit of remediation risk — that is, how much security is
gained per unit of change required. A one-line gate added next to an existing
gate ranks above a finding of similar severity that needs a protocol change.

11 of the 27 survived on a **split 2-of-3 vote** (F018, F019, F021, F026, F027, F004, F006, F017, F028, F033, F048) —
one verifier actively believed each of these was wrong. They are weaker evidence
than the unanimous ones and are marked as such in the table.

| ID | Severity | Vote | Location | Category |
|---|---|---|---|---|
| F009 | high | 3/3 | `crates/buzz-relay/src/audio/handler.rs:244` | authz-bypass |
| F014 | high | 3/3 | `desktop/src/features/messages/lib/formatTimelineMessages.ts:239` | parser-differential-authorship-spoofing |
| F015 | high | 3/3 | `mobile/lib/features/channels/timeline_message.dart:356` | parser-differential |
| F023 | high | 3/3 | `crates/buzz-media/src/validation.rs:270` | resource-exhaustion |
| F002 | medium | 3/3 | `crates/buzz-relay/src/api/bridge.rs:118` | authentication-bypass |
| F008 | medium | 3/3 | `crates/buzz-relay/src/api/media.rs:96` | resource-exhaustion |
| F010 | medium | 3/3 | `crates/buzz-relay/src/handlers/ingest.rs:2733` | correctness |
| F022 | medium | 3/3 | `crates/buzz-relay/src/handlers/req.rs:239` | resource-leak |
| F030 | medium | 3/3 | `mobile/lib/shared/relay/nostr_models.dart:113` | auth-verification-gap |
| F032 | medium | 3/3 | `crates/buzz-relay/src/api/admin/auth.rs:6` | authz |
| F035 | medium | 3/3 | `desktop/src/shared/lib/linkPreview.ts:168` | algorithmic-complexity |
| F018 | medium | 2/3 | `mobile/lib/features/pairing/pairing_provider.dart:103` | authentication-bypass |
| F019 | medium | 2/3 | `crates/buzz-sdk/src/nip_oa.rs:231` | authz-bypass |
| F021 | medium | 2/3 | `crates/buzz-sdk/src/nip_oa.rs:214` | crypto-verification-incomplete |
| F026 | medium | 2/3 | `crates/buzz-relay/src/api/mod.rs:86` | auth-delegation-expiry-not-enforced |
| F027 | medium | 2/3 | `crates/buzz-relay/src/handlers/auth.rs:231` | error-classification |
| F038 | low | 3/3 | `mobile/lib/features/pairing/pairing_provider.dart:680` | ssrf |
| F040 | low | 3/3 | `crates/buzz-auth/src/rate_limit.rs:188` | dead-security-control |
| F041 | low | 3/3 | `web/src/features/repos/use-repo-refs.ts:51` | authorization-gap |
| F046 | low | 3/3 | `desktop/src-tauri/src/commands/messages.rs:246` | silent-truncation |
| F047 | low | 3/3 | `desktop/src-tauri/src/commands/messages.rs:659` | idempotency |
| F004 | low | 2/3 | `desktop/src-tauri/src/commands/identity.rs:618` | recovery-mode-signing-gate-bypass |
| F006 | low | 2/3 | `desktop/src-tauri/src/commands/profile.rs:80` | data-loss |
| F017 | low | 2/3 | `mobile/lib/shared/relay/relay_session.dart:462` | data-loss |
| F028 | low | 2/3 | `crates/buzz-relay/src/handlers/auth.rs:196` | error-classification |
| F033 | low | 2/3 | `desktop/src-tauri/tauri.conf.json:37` | missing-hardening |
| F048 | low | 2/3 | `desktop/src-tauri/src/commands/channels.rs:221` | silent-failure |

### The two findings we would fix first

**F009 and the F014/F015 pair** are the highest value per unit of risk.

**F009** — the huddle-audio WebSocket re-implements NIP-42 admission but omits the
community-ban gate the main WebSocket path enforces. The fix is to call the
existing `moderation_restriction_state` check on the audio path, next to the auth
it already does. Low remediation risk, closes a ban bypass. Note the caveat in
Coverage gaps: this finding comes out of a 5,836-line subsystem of which roughly
one file was read.

**F014 + F015** are the *same defect implemented twice*: both the desktop and the
mobile client resolve a kind:40003 edit's target using the **last** `e` tag, while
the relay uses a different rule. That is a parser differential across a trust
boundary, and it is worth more attention than either finding alone, because it
means the two clients and the server disagree about which event an edit applies
to. Fixing one platform and not the other leaves the differential in place.


### F009 — HIGH — `crates/buzz-relay/src/audio/handler.rs:244`

**Category:** authz-bypass  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** high, high, high  ·  **Reporter originally claimed:** high

**Claim.** The huddle-audio WebSocket auth path re-implements NIP-42 admission but omits the community ban gate (and the pubkey allowlist gate) that the main WebSocket auth path enforces. `moderation_restriction_state` is called in exactly four places in buzz-relay — handlers/auth.rs:121, handlers/auth.rs:143, handlers/ingest.rs:1998, handlers/moderation_commands.rs:105, handlers/relay_admin.rs:168 — and none of them is on the  …

**How it fails.** A pubkey is banned in community C. Its main relay WebSocket is refused at handlers/auth.rs:159-182 and its event writes are refused at handlers/ingest.rs:1998. The same actor then opens `GET /huddle/{channel_id}/audio` (registered at router.rs:125-128), receives the challenge generated at audio/handler.rs:175, signs a kind:22242 AUTH event, and passes `verify_auth_event` at audio/handler.rs:222. `enforce_relay_membership` at line 244 succeeds (the actor is still a relay member — a ban is not a membership removal),  …

**Evidence (verified present in the file by Gate A):**
```
if crate::api::relay_members::enforce_relay_membership(
        &state,
        tenant.community(),
        pubkey.as_bytes(),
        auth_tag_json.as_deref(),
    )
```
**Reachable path.** Remote attacker (banned pubkey, still a relay member) -> GET /huddle/{channel_id}/audio (crates/buzz-relay/src/router.rs:125-128) -> ws_audio_handler (audio/handler.rs:64; only Host->community binding + connection permit before upgrade) -> handle_audio_connection (audio/handler.rs:137) -> handle_active_audio_connection (audio/handler.rs:166) -> challenge sent (audio/handler.rs:175) -> attacker signs kind:22242, verif …

**What the verifiers said:**

> Verified by reading the whole audio admission path and every ban call site. The route `/huddle/{channel_id}/audio` is registered unconditionally (crates/buzz-relay/src/router.rs:125-128) with no cargo feature or debug gate (`pub mod audio` in crates/buzz-relay/src/lib.rs:10). Pre-upgrade the handler only binds the community from the Host header and takes a connection permit (audio/handler.rs:64-107) — no auth. After the challe …

### F014 — HIGH — `desktop/src/features/messages/lib/formatTimelineMessages.ts:239`

**Category:** parser-differential-authorship-spoofing  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** high, high, high  ·  **Reporter originally claimed:** high

**Claim.** The desktop resolves a kind:40003 edit's target using the LAST valid `e` tag (getReactionTargetId at formatTimelineMessages.ts:118-131 iterates `for (let index = tags.length - 1; index >= 0; index -= 1)`), while the relay authorises the same event against the FIRST valid `e` tag (crates/buzz-relay/src/handlers/ingest.rs:790-806, `event.tags.iter().find_map(...)` inside validate_edit_ownership). Nothing constrains the …

**How it fails.** Mallory is an ordinary member of #general. (1) She posts her own message M_m and notes its id. (2) She publishes kind:40003 with tags `[["h", channelId], ["e", M_m_id], ["e", M_victim_id]]` and content "I've transferred the keys to mallory@evil.example — use that from now on". (3) Relay ingest: validate_edit_ownership (ingest.rs:790) takes the FIRST `e` tag = M_m_id, looks up M_m, finds effective author == Mallory (ingest.rs:829-831), re-checks her channel membership, and accepts; the generic membership gate is ski …

**Evidence (verified present in the file by Gate A):**
```
const targetId = getReactionTargetId(event.tags);
    if (!targetId || deletedEventIds.has(targetId)) {
```
**Reachable path.** Attacker = ordinary member of channel #general (holds MessagesWrite, ingest.rs:250). 1) Publishes kind:40003 with tags [["h",chan],["e",own_msg_id],["e",victim_msg_id]] over the normal EVENT ingest path. 2) crates/buzz-relay/src/handlers/ingest.rs:2152-2158 — generic membership gate skipped for KIND_STREAM_MESSAGE_EDIT. 3) ingest.rs:2330-2343 — e-tag cardinality check does not apply (kind != 5/9005), so two `e` tags  …

**What the verifiers said:**

> The parser differential is real and every hop is live production code. Relay: `validate_edit_ownership` selects the target with a forward `find_map` over `e` tags (crates/buzz-relay/src/handlers/ingest.rs:788-806) — first valid 64-hex `e` tag wins. Desktop: `getReactionTargetId` scans tags in reverse (desktop/src/features/messages/lib/formatTimelineMessages.ts:117-131) — last valid `e` tag wins. Nothing reconciles them: the e/ …

### F015 — HIGH — `mobile/lib/features/channels/timeline_message.dart:356`

**Category:** parser-differential  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** high, high, high  ·  **Reporter originally claimed:** high

**Claim.** The mobile timeline resolves a kind:40003 edit event's target using the LAST `e` tag (`_lastETag`, line 586: it scans `for (var i = tags.length - 1; i >= 0; i--)`), while the relay authorizes the same event against the FIRST 64-hex `e` tag (crates/buzz-relay/src/handlers/ingest.rs `validate_edit_ownership`, which does `event.tags.iter().find_map(...)`). Unlike kind:5/9005 deletions — which the relay explicitly caps a …

**How it fails.** Mallory is a member of channel #eng. She posts an ordinary message M_a. She then publishes a kind:40003 event with tags [["h", "<eng-channel-id>"], ["e", "<M_a id>"], ["e", "<Alice's message id>"]] and content "approved, wire the funds to acct 12345". The relay's validate_edit_ownership reads the first e tag (M_a), sees author == actor, and accepts and fans out the event. Every mobile client that renders #eng runs formatTimeline over the channel window; `_lastETag` returns Alice's message id, so `edits[<Alice's mes …

**Evidence (verified present in the file by Gate A):**
```
if (event.kind != EventKind.streamMessageEdit) continue;
    if (deletedIds.contains(event.id)) continue;

    final targetId = _lastETag(event.tags);
```
**Reachable path.** Attacker = member of #eng with MessagesWrite (crates/buzz-relay/src/handlers/ingest.rs:250). 1) Publish kind:40003, tags [["h",eng],["e",own_msg_id],["e",alice_msg_id]]. 2) ingest.rs:2152-2158 skip_membership for KIND_STREAM_MESSAGE_EDIT. 3) ingest.rs:2330-2343 cardinality rule not applied to 40003. 4) ingest.rs:2345 -> validate_edit_ownership; ingest.rs:788-806 forward find_map selects own_msg_id; ingest.rs:829-851  …

**What the verifiers said:**

> Same differential, independently verified on the mobile client, all shipped code. `_lastETag` (mobile/lib/features/channels/timeline_message.dart:586-592) walks tags backwards and — unlike the desktop helper — does not even require 64-hex, so the last `e` tag always wins, while the relay authorizes on the first valid `e` tag (crates/buzz-relay/src/handlers/ingest.rs:788-806). No e-tag cardinality limit exists for kind:40003 (t …

### F023 — HIGH — `crates/buzz-media/src/validation.rs:270`

**Category:** resource-exhaustion  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** high, medium, high  ·  **Reporter originally claimed:** high

**Claim.** The image-bomb guard measures dimensions with `imagesize`, which for GIF reads ONLY the logical screen descriptor (file offset 6-9), while the decoder that actually allocates (`image::load_from_memory` in thumbnail.rs:26) sizes its buffer from the per-frame image-descriptor width/height. `validate_gif_metadata_free` walks the image descriptor but only reads the packed byte at `bytes[i + 9]` (line 771) and then does ` …

**How it fails.** Attacker with any accepted Blossom signer key (on an open relay, membership is not enforced) sends `PUT /upload` with a ~1 KiB GIF: header `GIF89a`, logical screen width=1 height=1, packed=0x00, then one image descriptor with left=0, top=0, width=65535, height=2048, a 6-byte local colour table, and an LZW stream of a solid colour, then the 0x3B trailer. crates/buzz-relay/src/api/media.rs:369 sniffs image/gif and routes to buzz_media::process_upload (upload.rs:207). validation.rs:734 `validate_gif_metadata_free` acc …

**Evidence (verified present in the file by Gate A):**
```
let size = imagesize::blob_size(bytes).map_err(|_| MediaError::InvalidImage)?;
    if (size.width as u64) * (size.height as u64) > MAX_PIXELS {
        return Err(MediaError::ImageTooLarge);
```
**Reachable path.** Remote PUT /upload with a self-signed Blossom auth event -> crates/buzz-relay/src/api/media.rs:139 AuthenticatedUpload::from_request_parts -> media.rs:211 enforce_relay_membership returns OpenRelay (crates/buzz-relay/src/config.rs:534 default false) -> media.rs:369-375 sniffs image/gif -> buzz_media::process_upload (crates/buzz-media/src/upload.rs:207) -> validate_content (crates/buzz-media/src/validation.rs:238) ->  …

**What the verifiers said:**

> I verified every hop against the vendored crate sources and it holds. (a) crates/buzz-media/src/validation.rs:734 `validate_gif_metadata_free` reads the image descriptor's packed byte at bytes[i+9] then does `i += 10` (lines 771-772) — the frame width/height at bytes[i+5..i+9] are never read or bounded, confirmed by reading lines 763-828. (b) imagesize 0.14.0 (Cargo.lock:3922) src/formats/gif.rs seeks to offset 6 and returns O …

### F002 — MEDIUM — `crates/buzz-relay/src/api/bridge.rs:118`

**Category:** authentication-bypass  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** low, high, medium  ·  **Reporter originally claimed:** critical

**Claim.** The HTTP bridge accepts an unauthenticated, unsigned `X-Pubkey` header as proof of identity whenever `require_auth_token` is false — and `require_auth_token` defaults to false (crates/buzz-relay/src/config.rs:524-526, `std::env::var("BUZZ_REQUIRE_AUTH_TOKEN")...unwrap_or(false)`). Every bridge read route passes that config flag straight through: `/query` (bridge.rs:908-914), `/count` (bridge.rs:1350-1356), and the mo …

**How it fails.** Attacker knows any victim's Nostr public key (public by construction — it appears in every event the victim signs). Against a relay deployed without `BUZZ_REQUIRE_AUTH_TOKEN=true`, they send `POST /query` with `Host: <tenant host>`, no `Authorization` header, header `X-Pubkey: <victim 64-hex pubkey>`, body `[{}]`. `query_events` (bridge.rs:884) binds the tenant from Host, calls `verify_bridge_auth` (bridge.rs:908) which falls into the branch at line 118, returns `(victim_pubkey, [0u8;32])`. `query_events_authed` th …

**Evidence (verified present in the file by Gate A):**
```
if !require_auth_token {
        if let Some(hex_val) = headers.get("x-pubkey").and_then(|v| v.to_str().ok()) {
```
**Reachable path.** attacker HTTP POST /query with Host: <tenant host>, no Authorization, X-Pubkey: <victim hex pubkey>, body [{}] -> crates/buzz-relay/src/api/bridge.rs:884 query_events -> :908 verify_bridge_auth(..., state.config.require_auth_token=false) -> :117-125 X-Pubkey branch returns (victim_pubkey, [0u8;32]) -> :922 query_events_authed -> :957 check_nip98_replay -> :150-153 zero id short-circuits Ok -> :983-1005 p-gated/author …

**What the verifiers said:**

> The code behaviour is described accurately and the impact under the stated precondition is real, but the precondition is operator misconfiguration that every shipped deployment artifact already prevents, so critical is far too high. Confirmed at low. Accurate parts: verify_bridge_auth_with_options falls back to an unsigned X-Pubkey header when require_auth_token is false (bridge.rs:117-125), returns a zero event id which check …

### F008 — MEDIUM — `crates/buzz-relay/src/api/media.rs:96`

**Category:** resource-exhaustion  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** medium, medium, medium  ·  **Reporter originally claimed:** high

**Claim.** The media upload rate limiter is a plain DashMap keyed by (community_id, uploader pubkey) that is inserted into on every upload attempt and never evicted, swept, or capped, so an attacker who mints fresh Nostr keypairs grows relay heap without bound. The per-pubkey rate limit cannot slow this: each fresh key is a brand-new window, and the rate limiter is the very thing being grown. This is the exact threat the same f …

**How it fails.** On a default deployment (require_relay_membership defaults to false — crates/buzz-relay/src/config.rs:1018-1019 asserts this), an attacker loops: generate a secp256k1 keypair (~50us, free), sign a kind:24242 Blossom auth event with a valid t/x/expiration tag set, and PUT /upload with a small body and a matching X-SHA-256. Each request passes bind_community (media.rs:165), verify_blossom_auth_event (media.rs:177), the x-tag check (media.rs:195-201) and the open-relay membership short-circuit (api/mod.rs:67-69), then …

**Evidence (verified present in the file by Gate A):**
```
let mut entry = state
        .media_upload_rate_limiter
        .entry(key)
        .or_insert((0, now));
```
**Reachable path.** Attacker (no account, no membership) -> PUT /upload on the public relay host (crates/buzz-relay/src/router.rs:40) -> AuthenticatedUpload::from_request_parts -> crate::tenant::bind_community (media.rs:165) -> extract_blossom_auth + verify_blossom_auth_event with a freshly generated keypair (media.rs:176-177) -> X-SHA-256 format + x-tag match, both attacker-chosen (media.rs:181-201) -> api/mod.rs:124-131 enforce_relay_ …

**What the verifiers said:**

> Verified end to end. `media_upload_rate_limiter` is declared as `Arc<ScopedRateLimiter>` = `Arc<DashMap<ScopedPubkeyKey, SlidingWindowCounter>>` (state.rs:39, state.rs:592) and constructed as a bare `DashMap::new()` (state.rs:775). `upload_rate_limited` (media.rs:86-108) does `.entry(key).or_insert((0, now))` and only ever resets the counter in place -- it never removes. Grep for `media_upload_rate_limiter` across the whole cr …

### F010 — MEDIUM — `crates/buzz-relay/src/handlers/ingest.rs:2733`

**Category:** correctness  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** medium, low, medium  ·  **Reporter originally claimed:** high

**Claim.** Ingesting a kind:7 (NIP-25 reaction) that targets a channel-less/global event (e.g. a kind:1 text note, which is always global per is_global_only_kind) leaves channel_id as None, and the tracing code on this line unconditionally does channel_id.expect("reaction path has channel"), which panics.

**How it fails.** An authenticated user with ordinary MessagesWrite scope submits EVENT kind:7 with an `e` tag pointing at any previously-stored global event (e.g. a kind:1 text note authored by anyone). derive_reaction_channel looks up the target, finds target.channel_id == None (global events have no channel), and returns ReactionChannelResult::NoChannel, so `channel_id` stays None all the way through ingest_event_inner (KIND_REACTION is not in is_global_only_kind or requires_h_channel_scope, so nothing forces channel_id back to S …

**Evidence (verified present in the file by Gate A):**
```
channel: channel_label(channel_id.expect("reaction path has channel")),
```
**Reachable path.** Authenticated NIP-42 peer sends EVENT kind:7 with an e-tag on any stored kind:1 -> handlers/event.rs:728 (or HTTP publish api/bridge.rs:837) -> handlers/ingest.rs:1767 ingest_event -> ingest_event_inner (ingest.rs:1806) -> ingest.rs:2026-2029 derive_reaction_channel -> NoChannel -> channel_id = None (target kind:1 stored with NULL channel per is_global_only_kind, ingest.rs:395-399) -> no gate rejects (requires_h_chan …

**What the verifiers said:**

> The unwrap is genuinely reachable from an authenticated remote peer, but the reporter's DoS characterization is overstated. Reachability: kind:1 is in is_global_only_kind (ingest.rs:395-399), so stored text notes have channel_id NULL; derive_reaction_channel (ingest.rs:374-378) returns NoChannel for such a target and ingest_event_inner maps that to `None` (ingest.rs:2026-2029). Nothing forces it back: is_global_only_kind does  …

### F022 — MEDIUM — `crates/buzz-relay/src/handlers/req.rs:239`

**Category:** resource-leak  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** medium, medium, medium  ·  **Reporter originally claimed:** high

**Claim.** A REQ whose handler task is still running when its WebSocket closes registers a subscription into `sub_registry` and retains a Redis topic that nothing will ever remove, because `remove_connection` (the only reclaim path) already ran. Each such REQ permanently leaks a subscription entry, its fan-out index entries, and one Redis topic refcount.

**How it fails.** Client opens a WS, completes NIP-42 AUTH, sends `["REQ","s",{"kinds":[1]}]`, and immediately closes the socket. `handle_req` was spawned detached at connection.rs:552 and is awaiting `get_accessible_channel_ids_cached` (req.rs:93) — a DB round-trip. Meanwhile `recv_loop` returns, and `handle_active_connection` runs `cancel.cancel()` and awaits only send/heartbeat/auth tasks (connection.rs:260-263), then calls `state.sub_registry.remove_connection(conn.conn_id)` at connection.rs:265 — which finds nothing. The DB cal …

**Evidence (verified present in the file by Gate A):**
```
let replaced = state.sub_registry.register_scoped(
        conn.tenant.community(),
        conn_id,
        sub_id.clone(),
        filters.clone(),
        channel_id,
    );
```
**Reachable path.** Remote WS client -> NIP-42 AUTH (crates/buzz-relay/src/connection.rs:506) -> sends ["REQ",...] -> crates/buzz-relay/src/connection.rs:552 tokio::spawn(handle_req) detached -> crates/buzz-relay/src/handlers/req.rs:93 awaits get_accessible_channel_ids_cached (DB). Client closes socket -> recv_loop returns (connection.rs:258) -> cancel.cancel() (260) -> awaits only send/heartbeat/auth tasks (261-263) -> crates/buzz-rela …

**What the verifiers said:**

> The ordering hazard is real and I could not find a defense. `handle_req` is spawned fully detached at crates/buzz-relay/src/connection.rs:552-558 (`tokio::spawn`, handle dropped, only a semaphore permit held). The connection teardown at connection.rs:258-271 awaits ONLY send_task, heartbeat_task and auth_timeout_task (lines 261-263) — the spawned REQ/EVENT/COUNT tasks are never joined and there is no JoinSet. `remove_connectio …

### F030 — MEDIUM — `mobile/lib/shared/relay/nostr_models.dart:113`

**Category:** auth-verification-gap  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** medium, medium, medium  ·  **Reporter originally claimed:** high

**Claim.** The mobile app's primary NostrEvent model, used to parse every EVENT frame received from a relay over the main channel/message/timeline subscription pipeline (relay_session.dart), never verifies the event's id (SHA-256 of canonical serialization) or its Schnorr signature. NostrEvent.fromJson simply copies the id/pubkey/sig fields out of untrusted JSON with no cryptographic check. This is inconsistent with the app's o …

**How it fails.** A malicious or compromised relay (or a MITM if the operator's deployment terminates TLS elsewhere, per SECURITY.md's statement that 'the relay itself does not enforce TLS'), or any relay the user connects to via an invite/pairing deep link, can send an EVENT frame with an arbitrary pubkey, content, kind, and tags with a bogus or unchecked id/sig. relay_session.dart's `_handleEvent` (around line 449) calls `NostrEvent.fromJson(eventJson)` directly and hands the resulting event to channel timelines, DMs, profile meta …

**Evidence (verified present in the file by Gate A):**
```
factory NostrEvent.fromJson(Map<String, dynamic> json) {
    return NostrEvent(
      id: json['id'] as String,
      pubkey: json['pubkey'] as String,
```
**Reachable path.** relay WebSocket frame -> mobile/lib/shared/relay/relay_session.dart:151-162 (`_onMessage` switch, case 'EVENT') -> relay_session.dart:449 `_handleEvent` calls `NostrEvent.fromJson(eventJson)` -> mobile/lib/shared/relay/nostr_models.dart:113-126 (fields copied verbatim, no id/sig check) -> relay_session.dart:456-467 event appended to `_historySubscriptions` / `_eventBuffer` and flushed to live subscribers; same unveri …

**What the verifiers said:**

> The claim holds on inspection. `NostrEvent.fromJson` (mobile/lib/shared/relay/nostr_models.dart:113) copies id/pubkey/sig straight out of JSON with no id recomputation and no Schnorr check, and nothing downstream compensates: a repo-wide search of mobile/lib for verification primitives returns only two hits, `nostr.Event.fromJson` in the pairing path (mobile/lib/features/pairing/pairing_provider.dart:337) and `nostr.Schnorr.ve …

### F032 — MEDIUM — `crates/buzz-relay/src/api/admin/auth.rs:6`

**Category:** authz  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** medium, medium, medium  ·  **Reporter originally claimed:** high

**Claim.** The entire read-only deployment-admin API (moderation reports, product feedback, and feedback attachments) is gated solely by comparing the client-supplied HTTP `Host` header (and `Origin` header) against a configured admin hostname string — there is no bearer token, session, or Nostr-signature check on these routes.

**How it fails.** router.rs merges the admin router (`/api/admin/v1/*`, see api/admin/mod.rs router()) into the same Axum Router that serves all other relay traffic on the same listener/port. `authorize()` in this file calls `is_admin_host`, which only checks `headers.get(header::HOST) == config.host`. Any client that can reach the relay's port — which is guaranteed since it's the same socket as public API/WS traffic — can set an arbitrary `Host: <admin-host-value>` header on a raw HTTP request (curl, not a browser, so the Origin ch …

**Evidence (verified present in the file by Gate A):**
```
headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|host| host == config.host)
```
**Reachable path.** Operator sets BUZZ_ADMIN_HOST (crates/buzz-relay/src/config.rs:874) -> admin router mounted on the public listener at crates/buzz-relay/src/router.rs:60 and merged at router.rs:140-141 -> unauthenticated attacker who can open a TCP connection to the relay's bind addr sends `GET /api/admin/v1/reports` with `Host: <BUZZ_ADMIN_HOST>` and no Origin header -> crates/buzz-relay/src/api/admin/mod.rs:98 `authorize(&state, &h …

**What the verifiers said:**

> The code reads as described. `authorize` (crates/buzz-relay/src/api/admin/auth.rs:16-32) applies only two checks: exact `Host` equality via `is_admin_host` (auth.rs:6-14) and an Origin check written as `headers.get(ORIGIN).is_some_and(...)`, which is skipped entirely when no Origin header is sent — so curl bypasses it. There is no bearer token, session, or NIP-98/Nostr-signature check on these routes, and every handler gates o …

### F035 — MEDIUM — `desktop/src/shared/lib/linkPreview.ts:168`

**Category:** algorithmic-complexity  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** medium, medium, high  ·  **Reporter originally claimed:** high

**Claim.** `stripHiddenLinkPreviewContent` runs on every rendered message body and is quadratic in body length: `collectInlineSpoilerRanges` calls `isIndexInRanges` (an O(R) `Array.some`) at every `||` occurrence, and `collectBlockSpoilerRanges` calls `overlapsRange` (also O(R)) for every line equal to `||`, where R is the number of code/image ranges the attacker can also inflate from the same body. Unlike the parsed markdown t …

**How it fails.** Mallory posts one message whose content alternates lines of `` `a` `` (an inline code span, producing one entry in `codeRanges`) and lines of `||` (a block-spoiler delimiter line), up to the relay's 256 KB content limit (`MAX_EVENT_CONTENT_BYTES` in crates/buzz-relay/src/handlers/ingest.rs). That yields on the order of 3x10^4 code ranges and 4x10^4 `||` lines. `MarkdownInner` (desktop/src/shared/ui/markdown.tsx:1871-1874) calls `extractSupportedLinkPreviews(content)` synchronously inside the render-path `useMemo`,  …

**Evidence (verified present in the file by Gate A):**
```
if (
      content[index] === "|" &&
      content[index + 1] === "|" &&
      !isIndexInRanges(index, excludedRanges) &&
      !isIndexInRanges(index + 1, excludedRanges)
```
**Reachable path.** Attacker channel member posts ~256KB body of alternating `a`/|| lines; relay accepts (crates/buzz-relay/src/handlers/ingest.rs:1868-1869, cap=256KB) -> victim views channel, desktop/src/features/messages/ui/MessageRow.tsx:357 renders <Markdown content={message.body}> (interactive defaults true, markdown.tsx:1355/1837) -> desktop/src/shared/ui/markdown.tsx:1872 useMemo runs extractSupportedLinkPreviews(content) synchr …

**What the verifiers said:**

> Confirmed reachable quadratic algorithmic complexity. Both collectBlockSpoilerRanges (overlapsRange, linkPreview.ts:78/140) and collectInlineSpoilerRanges (isIndexInRanges, linkPreview.ts:70/168) do O(R) Array.some scans, and with the alternating `a`/|| input both the range count R and the number of || occurrences scale linearly with content length, yielding ~n^2 ~= 1e9 ops at a 256KB body. It runs synchronously on the render  …

### F018 — MEDIUM — `mobile/lib/features/pairing/pairing_provider.dart:103`

**Category:** authentication-bypass  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** medium, low  ·  **Reporter originally claimed:** high

**Claim.** Any input that does not start with `nostrpair://` silently falls back to the legacy pairing flow, which base64-decodes an attacker-supplied JSON blob and imports its `nsec` + `relayUrl` as the active identity with no SAS, no transcript-hash check, no signature check and no confirmation dialog — a protocol downgrade the attacker chooses. The modern NIP-AB path (`_pairNipAb`) requires a 6-digit SAS the user must visual …

**How it fails.** Attacker prints/posts a QR whose payload is base64url of {"relayUrl":"https://evil.example","pubkey":"<attacker>","nsec":"nsec1<attacker>"} captioned "scan to join our Buzz community". Victim taps Scan on the unauthenticated PairingPage (lib/app.dart:104 makes PairingPage the landing screen) or on Add Community. `_firstScannedValue` (pairing_qr_scanner.dart:82) returns the raw string, `pair()` routes it to `_pairLegacy`, and the app authenticates as the attacker-controlled identity against the attacker's relay. Eve …

**Evidence (verified present in the file by Gate A):**
```
if (trimmed.startsWith('nostrpair://')) {
      return _pairNipAb(trimmed);
    }
    // Legacy buzz:// flow.
    return _pairLegacy(trimmed);
```
**Reachable path.** mobile/lib/features/pairing/pairing_page.dart:52 handleScannerResult -> :54 pair(code) -> mobile/lib/features/pairing/pairing_provider.dart:91 pair -> :99 input not starting with nostrpair:// falls through to :103 _pairLegacy -> :567/:625 _parseLegacyInput base64url-decodes attacker JSON (relayUrl/pubkey/nsec) -> :569 _validateCredentials (only checks nsec present + relayUrl is https/non-private) -> :576 authenticate …

**What the verifiers said:**

> The legacy path is reachable from the QR scanner and imports an attacker-supplied nsec+relay with zero verification — that part is accurately read (no SAS, no confirmation; relayUrl is validated for scheme/private-range only). But this is QR-phishing dependent on socially engineering the victim into scanning an attacker QR, and the reporter's impact is overstated: the imported key is freshly attacker-generated, so the victim A …

### F019 — MEDIUM — `crates/buzz-sdk/src/nip_oa.rs:231`

**Category:** authz-bypass  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** medium, low  ·  **Reporter originally claimed:** high

**Claim.** verify_auth_tag only syntax-checks the NIP-OA `conditions` string and never evaluates its clauses, and it takes no event to evaluate them against — so the relay's membership paths, which are its main consumers, grant access on an attestation whose `created_at<T` lifetime bound has already passed. docs/nips/NIP-OA.md states "Verifiers MUST evaluate every clause" and "Owners SHOULD bound authorization lifetime with a ` …

**How it fails.** An owner who is a relay member issues an agent an auth tag with conditions `created_at<1700000000`, intending it to expire, then stops trusting the agent. The agent (or anyone who copies the tag off a public event — the tag is a reusable capability by design, NIP-OA.md line 16) connects to a closed relay and sends a kind:22242 AUTH event carrying that tag. handlers/auth.rs:78 extracts it, handlers/auth.rs:221 passes it to enforce_relay_membership, which reaches api/mod.rs:86 `verify_auth_tag(tag_json, &agent_pubkey …

**Evidence (verified present in the file by Gate A):**
```
SECP256K1
        .verify_schnorr(&sig, &message, &xonly)
        .map_err(|e| SdkError::InvalidInput(format!("signature verification failed: {e}")))?;

    Ok(owner_pubkey)
```
**Reachable path.** crates/buzz-relay/src/handlers/auth.rs:78 extract_auth_tag_json -> :217/:221 enforce_relay_membership -> crates/buzz-relay/src/api/mod.rs:86 verify_auth_tag -> crates/buzz-sdk/src/nip_oa.rs:214 validate_conditions (SYNTAX ONLY) then :231-233 verify_schnorr and :235 Ok(owner) with no clause evaluation and no event passed in -> api/mod.rs:94 owner_is_member -> :100 MembershipDecision::ViaOwner -> agent authenticated to …

**What the verifiers said:**

> Confirmed the mechanical claim: verify_auth_tag only syntax-validates conditions and never evaluates created_at< or kind= (I searched the relay/sdk; the only created_at< evaluator is handlers/identity_archive.rs:336, a different feature). NIP-OA.md states verifiers MUST evaluate every clause, so an expired auth tag still grants membership-via-owner, and since the tag is a bearer credential carried in public events, a leaked/ex …

### F021 — MEDIUM — `crates/buzz-sdk/src/nip_oa.rs:214`

**Category:** crypto-verification-incomplete  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** medium, low  ·  **Reporter originally claimed:** high

**Claim.** `verify_auth_tag` validates the NIP-OA `conditions` string's *syntax* but never *evaluates* its clauses against anything — it takes no event and has nothing to evaluate against — yet every relay caller treats its `Ok(owner)` return as an unconditional, unexpiring capability. docs/nips/NIP-OA.md:64 states "Verifiers MUST evaluate every clause", and NIP-OA.md:98 names `created_at<...` as the mechanism owners SHOULD use …

**How it fails.** Owner O deliberately scopes a delegation narrowly: `conditions = "kind=1&created_at<1713957000"` (exactly the spec's own test vector at docs/nips/NIP-OA.md:119), intending "this agent may only post text notes, and only until April 2024". Agent A presents that tag as the `x-auth-tag` header or in its NIP-42 AUTH event. `verify_auth_tag` (this function) parses the four elements, calls `validate_conditions` — which only checks the string is well-formed decimal/clause syntax — verifies the Schnorr signature at line 231 …

**Evidence (verified present in the file by Gate A):**
```
let owner_pubkey = PublicKey::from_hex(owner_pubkey_hex)
        .map_err(|e| SdkError::InvalidInput(format!("invalid owner pubkey: {e}")))?;

    validate_conditions(conditions)?;
```
**Reachable path.** Remote WS AUTH (agent-signed NIP-42 event carrying its own `auth` tag) -> crates/buzz-relay/src/connection.rs:506 handle_auth -> crates/buzz-relay/src/handlers/auth.rs:221 auth_tag_json passed to enforce_relay_membership -> crates/buzz-relay/src/api/mod.rs:86 buzz_sdk::nip_oa::verify_auth_tag -> crates/buzz-sdk/src/nip_oa.rs:214 validate_conditions (syntax only) -> nip_oa.rs:235 Ok(owner). Default config (require_rel …

**What the verifiers said:**

> The code claim is accurate and the path is reachable, but the headline impact is overstated. Confirmed facts: `verify_auth_tag` (crates/buzz-sdk/src/nip_oa.rs:179-236) calls only `validate_conditions` (line 214), which is pure syntax checking (nip_oa.rs:36); it takes no event and returns `Ok(owner_pubkey)` at line 235 after Schnorr verification only. A repo-wide grep shows clause *evaluation* exists in exactly two places, neit …

### F026 — MEDIUM — `crates/buzz-relay/src/api/mod.rs:86`

**Category:** auth-delegation-expiry-not-enforced  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** medium, medium  ·  **Reporter originally claimed:** high

**Claim.** The relay's NIP-OA owner-delegation gate verifies only the Schnorr signature and the *syntax* of the attestation's `conditions` string; it never evaluates the clauses. `buzz_sdk::nip_oa::verify_auth_tag` calls `validate_conditions` (buzz-sdk/src/nip_oa.rs:214), which merely checks each clause parses as `kind=N` / `created_at<N` / `created_at>N`, and then returns the owner pubkey. No caller in the relay's membership p …

**How it fails.** An owner who is a relay member issues an agent a deliberately narrow, short-lived attestation, e.g. conditions = "kind=1&created_at<1700000000" (a wall-clock bound already in the past), intending the agent to be able to post text notes for one day only. The agent key reaches `check_relay_membership` at crates/buzz-relay/src/api/mod.rs:86 through any of five doors: WebSocket NIP-42 (crates/buzz-relay/src/handlers/auth.rs:217 -> enforce_relay_membership, with the tag lifted off the signed AUTH event at handlers/auth. …

**Evidence (verified present in the file by Gate A):**
```
match buzz_sdk::nip_oa::verify_auth_tag(tag_json, &agent_pubkey) {
```
**Reachable path.** Agent holding a narrow/expired attestation opens a WebSocket and sends NIP-42 AUTH -> crates/buzz-relay/src/handlers/auth.rs:78 extract_auth_tag_json lifts the signed `auth` tag -> handlers/auth.rs:217-223 enforce_relay_membership -> crates/buzz-relay/src/api/mod.rs:130 check_relay_membership -> api/mod.rs:86 buzz_sdk::nip_oa::verify_auth_tag -> crates/buzz-sdk/src/nip_oa.rs:214 validate_conditions (syntax only) -> n …

**What the verifiers said:**

> Code reading verified end to end. `verify_auth_tag` (crates/buzz-sdk/src/nip_oa.rs:179-236) calls `validate_conditions` at :214, and `validate_conditions`/`validate_clause`/`validate_canonical_decimal` (nip_oa.rs:36-107) only check that each clause parses as kind=N / created_at<N / created_at>N with canonical decimals — no clause is ever compared against anything. The function then returns the owner pubkey at :235. In `check_r …

### F027 — MEDIUM — `crates/buzz-relay/src/handlers/auth.rs:231`

**Category:** error-classification  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** low, medium  ·  **Reporter originally claimed:** high

**Claim.** A transient database failure in the relay-membership gate is reported to the client as "restricted: not a relay member" — a permanent-rejection prefix — instead of the "error:" prefix the client's own retry contract requires, so agents treat a database blip as a permanent identity rejection and stop retrying.

**How it fails.** Postgres is briefly unavailable (failover, connection-pool exhaustion, deploy). An agent connects: handlers/auth.rs:43 handle_auth -> NIP-42 verify succeeds -> api/mod.rs:130 check_relay_membership returns Err(db error) -> api/mod.rs:140-142 maps it to internal_error (HTTP 500, distinguishable from Denied's 403) -> handlers/auth.rs:226 collapses BOTH arms into one branch and sends "restricted: not a relay member". The buzz-acp agent receives OK false with that message: relay.rs:3868 wraps it as RelayError::AuthFail …

**Evidence (verified present in the file by Gate A):**
```
conn.send(RelayMessage::ok(
                        &event_id_hex,
                        false,
                        "restricted: not a relay member",
                    ));
```
**Reachable path.** Postgres blip during agent startup -> crates/buzz-relay/src/handlers/auth.rs:43 handle_auth -> NIP-42 verify ok (:87-91) -> :217 enforce_relay_membership -> crates/buzz-relay/src/api/mod.rs:130 check_relay_membership -> api/mod.rs:72-76 is_relay_member Err -> api/mod.rs:140-143 internal_error (500) -> handlers/auth.rs:226-235 single Err arm sends "restricted: not a relay member" -> crates/buzz-acp/src/relay.rs:3868 R …

**What the verifiers said:**

> Every hop checks out. `enforce_relay_membership` (crates/buzz-relay/src/api/mod.rs:129-145) returns two distinguishable Errs — a 403 `relay_membership_required` for Denied at :133-139 and a 500 via `internal_error` for the DB error at :140-143 — but handlers/auth.rs:226-237 matches `Err(e)` with a single arm and sends the fixed string "restricted: not a relay member" (:231-235), discarding the status. The DB-error source is re …

### F038 — LOW — `mobile/lib/features/pairing/pairing_provider.dart:680`

**Category:** ssrf  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low, low  ·  **Reporter originally claimed:** medium

**Claim.** `_isPrivateHost`, the SSRF guard used by the legacy `buzz://` pairing path (`_validateRelayUrl`, line 654, called from `_parseLegacyInput` line 644 and from `_processPayload` line 461), is far weaker than the project's own `validateInviteRelayUri`. It only splits on '.' and requires exactly 4 decimal-parsable parts, so it misses: any non-dotted-quad literal (decimal `2130706433`, hex `0x7f000001`, octal/leading-zero  …

**How it fails.** A user is handed a `buzz://<base64url payload>` pairing code (pasted into the pairing field or scanned as a QR — pairing_page.dart line 149 / line 54 both feed `pair()`). The payload decodes to {"relayUrl":"https://0177.0.0.1:8443","nsec":"..."} . `_validateRelayUrl` sees scheme https (OK in release), host is not the literal `localhost`/`127.0.0.1`/`::1`, and `_isPrivateHost` parses parts ['0177','0','0','1'] -> first octet 177, not private -> allowed. `_validateCredentials` then opens a WebSocket to `wss://0177.0. …

**Evidence (verified present in the file by Gate A):**
```
static bool _isPrivateHost(String host) {
    final parts = host.split('.');
    if (parts.length != 4) return false;
    final octets = parts.map(int.tryParse).toList();
    if (octets.any((o) => o == null)) return false;
```
**Reachable path.** attacker-supplied buzz:// code -> mobile/lib/features/pairing/pairing_page.dart:148 (paste) or :52 (QR scan) -> pairing_provider.dart:91 pair() -> :103 _pairLegacy -> :567 _parseLegacyInput -> :633 base64url/JSON decode of {"relayUrl":"https://127.0.0.2:8443","nsec":"..."} -> :644 _validateRelayUrl -> :665 literal compare misses 127.0.0.2 -> :673 _isPrivateHost -> :686-693 first octet 127 matches no branch, returns f …

**What the verifiers said:**

> The guard is as quoted and the path is live. Entry: attacker-supplied pairing string reaches PairingNotifier.pair() from the paste field (mobile/lib/features/pairing/pairing_page.dart:148 onConnect) or the QR scanner (pairing_page.dart:52 handleScannerResult). pair() (pairing_provider.dart:91) routes anything not starting with 'nostrpair://' to _pairLegacy (:103) -> _parseLegacyInput (:567) -> base64url decode (:632-633) -> _v …

### F040 — LOW — `crates/buzz-auth/src/rate_limit.rs:188`

**Category:** dead-security-control  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low, low  ·  **Reporter originally claimed:** medium

**Claim.** The per-IP connection fence declared by this trait is never wired up. `check_ip_connection` has exactly one implementation (crates/buzz-pubsub/src/rate_limiter.rs:112) and one call site in the whole repository — a test stub at crates/buzz-relay/src/admission.rs:85. `LimitType::IpConnections` is likewise constructed nowhere outside its own declaration (rate_limit.rs:66 and :76 are the only two hits under crates/), and …

**How it fails.** A single unauthenticated IP opens WebSocket connections in a loop against the relay. `handle_active_connection` (connection.rs:141) acquires only the deployment-global `conn_semaphore` permit and, when it is exhausted, logs 'Connection limit reached' and drops the socket — for every client, not just the abuser. Because no per-IP counter is ever incremented, one host can consume the entire global connection budget and deny service to the whole deployment; combined with the unauthenticated admission bypass at connect …

**Evidence (verified present in the file by Gate A):**
```
fn check_ip_connection(
        &self,
        ip: &IpAddr,
        window_secs: u64,
        limit: u64,
```
**Reachable path.** remote TCP connect (no credentials) -> crates/buzz-relay/src/router.rs:315 WebSocketUpgrade::from_request -> router.rs:327 .on_upgrade(handle_connection) -> crates/buzz-relay/src/connection.rs:118 handle_connection -> connection.rs:136/141 handle_active_connection -> connection.rs:149 state.conn_semaphore.try_acquire_owned() (global-only; no per-IP counter anywhere) -> connection.rs:152 all subsequent clients rejecte …

**What the verifiers said:**

> Every factual claim checks out. A repo-wide grep for check_ip_connection returns the trait declaration (crates/buzz-auth/src/rate_limit.rs:188), the Redis impl (crates/buzz-pubsub/src/rate_limiter.rs:112), and one call — inside `#[cfg(test)] mod tests` at crates/buzz-relay/src/admission.rs:47/85, a StubLimiter method that exists only to satisfy the trait for unit tests. LimitType::IpConnections appears only at rate_limit.rs:66 …

### F041 — LOW — `web/src/features/repos/use-repo-refs.ts:51`

**Category:** authorization-gap  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low, low  ·  **Reporter originally claimed:** medium

**Claim.** fetchRepoRefs queries kind:30618 (repo refs) events by `#d` tag only, with no `authors` filter restricting to the relay's own pubkey — the code has a TODO acknowledging that any community member with ReposWrite permission can publish a spoofed kind:30618 event that will be blended into the displayed branches/tags/HEAD for someone else's repo.

**How it fails.** Any user holding ReposWrite (a role short of repo ownership) publishes a kind:30618 event with the target repo's `d` tag but attacker-chosen `refs/heads/*` values; since dedup() only keys on (pubkey, kind, d) and parseRefs() merges tags across all matching events without checking which pubkey should be authoritative, this can inject a bogus branch name or HEAD SHA into the repo browser UI other users see, e.g. steering them toward a malicious ref during 'Run' HTML preview or clone.

**Evidence (verified present in the file by Gate A):**
```
// TODO: Filter by `authors: [relayPubkey]` once the relay's own pubkey is
  // exposed to the client. Without this, a user with ReposWrite permission
  // could publish fake kind:30618 events with spoofed refs.
  const events = await queryEvents(relayWsUrl(), {
    kinds: [30618],
    "#d": [repoId],
  });
```
**Reachable path.** Community member with ReposWrite publishes kind:30618 with d=<victim repo> over WS -> crates/buzz-relay/src/handlers/ingest.rs:303 (only scope check; no author/owner binding) -> event stored, no 30618 side-effect handler (crates/buzz-relay/src/handlers/side_effects.rs:213) -> victim opens repo page -> web/src/features/repos/use-repo-refs.ts:55-58 queries by #d with no authors filter -> web/src/features/repos/use-repo …

**What the verifiers said:**

> The mechanism is real but the payoff is display-only, so medium is too high. Confirmed parts: the relay's WebSocket ingest maps kind:30618 to nothing stronger than the ReposWrite scope (crates/buzz-relay/src/handlers/ingest.rs:303) and there is no side-effect handler for 30618 at all (crates/buzz-relay/src/handlers/side_effects.rs:213 handles only 30617), so any member holding ReposWrite can store a 30618 carrying another repo …

### F046 — LOW — `desktop/src-tauri/src/commands/messages.rs:246`

**Category:** silent-truncation  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low, low  ·  **Reporter originally claimed:** medium

**Claim.** `get_forum_thread` accepts `limit` and `cursor` and throws both away on its first line, never sets a `limit` on its reply filter (so the relay's default cap applies), and then reports `total_replies = replies.len()` — the count of whatever survived that invisible cap — while hard-coding `next_cursor: None`. The UI is handed a truncated reply set labelled as the complete one, with no way to page for the rest.

**How it fails.** A forum thread accumulates more replies than the relay's default query limit. A user opens it: the second filter at lines 253-257 carries `kinds`/`#e`/`#h` and no `limit`, so the relay returns its default slice. `total_replies` (line 271) counts only that slice, so the thread header reads e.g. '50 replies' when there are 400. `next_cursor` is `None`, so the frontend has nothing to page with, and the `limit`/`cursor` arguments it did pass were discarded at line 246. Replies are permanently invisible in the UI and th …

**Evidence (verified present in the file by Gate A):**
```
let _ = (limit, cursor);
```
**Reachable path.** User opens a forum thread in a shipped build -> ForumView.tsx:56 useForumThreadQuery -> desktop/src/features/forum/hooks.ts:49 getForumThread(channelId, eventId, undefined, undefined) -> desktop/src/shared/api/forum.ts:150 invokeTauri('get_forum_thread') -> desktop/src-tauri/src/commands/messages.rs:246 discards limit/cursor -> reply filter without limit at messages.rs:253-257 -> relay DB default cap 100 at crates/bu …

**What the verifiers said:**

> Confirmed exactly as described, but it is a UX/correctness truncation with no security dimension, so severity drops to low. The command is registered (desktop/src-tauri/src/lib.rs:770) and called on every thread open. messages.rs:246 discards limit and cursor (`let _ = (limit, cursor);`); the reply filter at messages.rs:253-257 carries kinds/#e/#h and no limit; the relay's DB layer defaults an unlimited filter to 100 rows (cra …

### F047 — LOW — `desktop/src-tauri/src/commands/messages.rs:659`

**Category:** idempotency  ·  **Verifier vote:** 3/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low, low  ·  **Reporter originally claimed:** medium

**Claim.** The marker-scan paging loop backing `send_managed_agent_channel_message`'s duplicate suppression advances its cursor to `min(created_at) - 1`, which skips every event sharing that oldest second beyond the 500-row page boundary. It is also bounded at 10 pages (5000 events). Either miss makes `find_managed_agent_channel_message_by_marker` return `None` for a marker that does exist, and the caller then posts the message …

**How it fails.** An agent posts a marked announcement into a busy channel. Later the same flow re-runs (app restart, retry, config change). `send_managed_agent_channel_message` calls the marker scan at line 816; the relay returns a full 500-event page whose oldest 40 events all share one second. The loop sets `until = that_second - 1`, jumping over the ~30 events at that second that did not fit in the page — one of which carries the marker. The scan reports 'no existing marker', the guard at lines 815-836 does not short-circuit, an …

**Evidence (verified present in the file by Gate A):**
```
until = events
            .iter()
            .map(|event| event.created_at.as_secs())
            .min()
            .map(|timestamp| timestamp.saturating_sub(1));
```
**Reachable path.** User focuses the Welcome channel in a shipped build -> useWelcomeKickoff effect (welcomeKickoff.ts:554-687) -> sendManagedAgentChannelMessage (welcomeKickoff.ts:673) -> desktop/src/shared/api/tauriManagedAgentMessages.ts:23 invoke('send_managed_agent_channel_message') -> messages.rs:765 command (registered lib.rs:767) -> marker guard messages.rs:815-822 -> find_managed_agent_channel_message_by_marker messages.rs:622  …

**What the verifiers said:**

> The code defect is real and the command is live, but the only shipped caller that uses markers is the Welcome-channel onboarding choreography, which sharply narrows the practical impact — low, not medium. Verified: find_managed_agent_channel_message_by_marker (messages.rs:622-670) advances its cursor with `until = min(created_at) - 1` (messages.rs:659-663), which skips any events sharing the oldest second that did not fit in t …

### F004 — LOW — `desktop/src-tauri/src/commands/identity.rs:618`

**Category:** recovery-mode-signing-gate-bypass  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low  ·  **Reporter originally claimed:** high

**Claim.** `sign_nostr_identity_binding` is the only signing command in identity.rs that reads `state.keys.lock()` directly instead of `state.signing_keys()`, so it bypasses the recovery-mode gate that refuses signing when `identity_lost` or `keyring_locked` is set. Every neighbouring signer in the same file (`sign_event` L115, `create_auth_event` L646, `build_observer_control_event` L170, `nip44_encrypt_to_self` L672, `get_nse …

**How it fails.** The user's OS keyring is wiped or unreadable at boot, so `resolve_identity` sets `identity_lost`/`keyring_locked` and `state.keys` holds a throwaway ephemeral keypair that will not survive the next launch (app_state.rs:306-322 is what normally blocks all signing in this state). While the recovery banner is up, the user clicks a `buzz://nostr-bind?challenge_id=...&nonce=...&verification_code=...&origin=https://site.example&expires_at=...` deep link (deep_link.rs:246-281, 369), consents in NostrBindConsentDialog, and …

**Evidence (verified present in the file by Gate A):**
```
let keys = state
        .keys
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
```
**Reachable path.** User is in recovery mode (app_state.rs:65-90 keyring_locked/identity_lost set at boot, state.keys holds an ephemeral keypair) -> user opens buzz://nostr-bind?challenge_id=...&nonce=...&verification_code=...&origin=https://site.example&expires_at=... -> desktop/src-tauri/src/deep_link.rs:369 dispatch -> deep_link.rs:246-276 parse_nostr_bind_deep_link validates fields -> deep_link.rs:372 app.emit("deep-link-nostr-bind" …

**What the verifiers said:**

> The code-reading is correct and I could not find a compensating guard anywhere on the path. desktop/src-tauri/src/commands/identity.rs:618-622 locks state.keys directly, while every sibling signer in the same file routes through state.signing_keys() (sign_event L115, build_observer_control_event L170, get_nsec L192, create_backup_with_log_n L232, create_auth_event L646, nip44_encrypt_to_self L672, nip44_decrypt_from_self L692) …

### F006 — LOW — `desktop/src-tauri/src/commands/profile.rs:80`

**Category:** data-loss  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low  ·  **Reporter originally claimed:** high

**Claim.** `update_profile` does a read-merge-write of the replaceable kind:0 profile but the merge only carries five fields forward. `build_profile` (events.rs:474-499) can only emit `display_name`, `name`, `picture`, `about`, `nip05`; every other key that was in the prior kind:0 content is silently dropped from the newly signed replacement event.

**How it fails.** A user has a kind:0 with `banner`, `website`, `lud16` (a Lightning address) set from any other Nostr client — buzz reads it fine because it only picks out five keys and ignores the rest. The user then edits their About text in buzz. `update_profile` reads the prior event (line 49-57), pulls only display_name/name/picture/about/nip05 out of `current` (lines 66-78), and calls `build_profile` with exactly those five. The relay replaces the old kind:0 (buzz-db/src/lib.rs replace_addressable_event soft-deletes the prior …

**Evidence (verified present in the file by Gate A):**
```
let builder = events::build_profile(dn, name, picture, ab, nip05)?;
```
**Reachable path.** User opens Settings -> ProfileSettingsCard.tsx:136 (useUpdateProfileMutation) -> desktop/src/shared/api/tauriProfiles.ts:82 invokeTauri('update_profile') -> desktop/src-tauri/src/commands/profile.rs:49-57 (read prior kind:0) -> profile.rs:66-78 (only 5 keys lifted) -> profile.rs:80 events::build_profile -> desktop/src-tauri/src/events.rs:474-499 (map built from 5 keys only) -> relay/submit.rs:69-79 submit_event repla …

**What the verifiers said:**

> The code behavior is exactly as described and is reachable through ordinary UI use, but the blast radius claimed is wrong. `update_profile` (profile.rs:38-97) reads the prior kind:0 (L49-57), lifts only display_name/name/picture/about/nip05 out of `current` (L66-78), and calls `events::build_profile` (events.rs:474-499), whose serde_json::Map is constructed from those five keys only -- any other key present in the prior conten …

### F017 — LOW — `mobile/lib/shared/relay/relay_session.dart:462`

**Category:** data-loss  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low  ·  **Reporter originally claimed:** high

**Claim.** lastSeenCreatedAt is advanced when an event is merely buffered (before delivery), but _handleDisconnected clears _eventBuffer without rolling lastSeenCreatedAt back; the reconnect replay then uses since = lastSeenCreatedAt - 5s, so buffered-but-undelivered events older than that are permanently lost to the live subscription.

**How it fails.** Flaky network: after a reconnect, _replayLiveSubscriptions (line 416) delivers a burst covering the whole disconnect gap (possibly minutes of messages). _handleEvent buffers them and advances liveSub.lastSeenCreatedAt to the newest event's timestamp (lines 462-465) while they sit in _eventBuffer awaiting the 16ms flush timer. The connection drops again inside that window -> _handleDisconnected runs _eventBuffer.clear() (line 387) so onEvent never fires for any of them, yet lastSeenCreatedAt still points at the newe …

**Evidence (verified present in the file by Gate A):**
```
if (liveSub.lastSeenCreatedAt == null ||
          event.createdAt > liveSub.lastSeenCreatedAt!) {
        liveSub.lastSeenCreatedAt = event.createdAt;
      }
```
**Reachable path.** mobile/lib/shared/relay/relay_session.dart:380 _handleConnected -> :416 _replayLiveSubscriptions sends REQ (since=lastSeen-5s) -> replay burst arrives at :445 _handleEvent, which advances liveSub.lastSeenCreatedAt at :462-464 BEFORE delivery and only buffers the event at :466 -> :488 _handleEose does not flush on reconnect (readyCompleter is null after first subscribe) so events wait for the 16ms flush timer -> a sec …

**What the verifiers said:**

> The logic error is real and correctly read: lastSeenCreatedAt is advanced at buffer time (line 462-464), not at delivery time (_flushEventBuffer at 604 is where onEvent actually fires), and _handleDisconnected clears _eventBuffer (387) without rolling back lastSeenCreatedAt. On the next replay only newest-5s is refetched, so a burst spanning >5s that is dropped mid-buffer loses its older events from the live subscription. Howe …

### F028 — LOW — `crates/buzz-relay/src/handlers/auth.rs:196`

**Category:** error-classification  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low  ·  **Reporter originally claimed:** high

**Claim.** The pubkey-allowlist gate maps a database lookup error to `allowed = false`, producing the same "auth-required: verification failed" message a bad Schnorr signature produces — so a transient DB error is indistinguishable from a forged event to both the client and the operator's metrics.

**How it fails.** With BUZZ pubkey allowlisting enabled and Postgres momentarily unavailable, an authorized user's or agent's AUTH reaches handlers/auth.rs:187, the is_pubkey_allowed call at :192 returns Err, the Err arm at :196-200 evaluates to `false`, and :202 denies. The connection is pinned to AuthState::Failed at :206 (which handle_auth's own early-return path at :58-66 makes permanent for the socket's life — every subsequent AUTH on that connection is refused), and the client is told "auth-required: verification failed" at :2 …

**Evidence (verified present in the file by Gate A):**
```
Err(e) => {
                        warn!(conn_id = %conn_id, pubkey = %pubkey.to_hex(), error = %e,
                              "allowlist DB lookup failed, denying (fail-closed)");
                        false
                    }
```
**Reachable path.** Postgres blip with BUZZ_PUBKEY_ALLOWLIST=true -> crates/buzz-relay/src/handlers/auth.rs:43 handle_auth -> NIP-42 verify ok (:87-91) -> ban gate clear (:119-131) -> :187-194 is_pubkey_allowed returns Err -> :196-200 Err arm yields false -> :202 deny -> :206 AuthState::Failed (permanent, enforced by :58-66) -> :207-211 sends "auth-required: verification failed" -> crates/buzz-acp/src/relay.rs:3868 AuthFailed -> relay.r …

**What the verifiers said:**

> Accurate reading. handlers/auth.rs:190-201 collapses `Ok(v)` and `Err(e)` into a bool, with the Err arm evaluating to `false` after a warn; :202 then treats that identically to a genuine allowlist miss, :204-205 increments buzz_auth_failures_total with reason="allowlist_denied", :206 pins AuthState::Failed, and :207-211 sends "auth-required: verification failed" — byte-identical to the message the real signature-verification f …

### F033 — LOW — `desktop/src-tauri/tauri.conf.json:37`

**Category:** missing-hardening  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low  ·  **Reporter originally claimed:** high

**Claim.** The Tauri app config sets `app.security.csp` to `null`, which disables Tauri's Content-Security-Policy injection entirely for the webview that renders relay-supplied content (messages, profiles, media).

**How it fails.** Nostr event content (message bodies, profile metadata, embedded HTML/markdown rendering) is attacker-controlled since it comes from arbitrary relays/peers per the domain brief. If any renderer path fails to escape relay-supplied content (a known recurring Nostr-client bug class), the resulting XSS runs with zero CSP restriction on script-src/connect-src/img-src, making arbitrary script execution, fetch-based exfiltration to attacker origins, and IPC bridge abuse all unmitigated by a defense-in-depth layer that Taur …

**Evidence (verified present in the file by Gate A):**
```
"security": {
      "csp": null
    }
```
**Reachable path.** desktop/src-tauri/tauri.conf.json:38-40 sets csp:null (CSP injection disabled) -> attacker relay content reaches webview at desktop/src/features/messages/ui/MessageRow.tsx:357 (<Markdown content={message.body}>). This removes a defense-in-depth layer, but no concrete script-execution sink is demonstrated.

**What the verifiers said:**

> The factual claim is accurate: csp is null, disabling Tauri's CSP injection for a webview that renders arbitrary relay-supplied content. However, this is a missing-hardening / defense-in-depth gap only. The finding provides NO demonstrated XSS sink — it is explicitly conditional ('if any renderer path fails to escape'). The markdown pipeline (react-markdown family) escapes HTML by default. Without a concrete reachable script-e …

### F048 — LOW — `desktop/src-tauri/src/commands/channels.rs:221`

**Category:** silent-failure  ·  **Verifier vote:** 2/3 confirmed  ·  **Severities returned by confirming verifiers:** low, low  ·  **Reporter originally claimed:** medium

**Claim.** `get_channels` swallows relay errors on both of its enrichment queries with `.unwrap_or_default()` (member counts at line 221, last-message timestamps at line 252). A transient relay failure on either query is indistinguishable from 'this data is genuinely empty': the command still returns `Ok` with every channel reporting zero members and no last-message timestamp.

**How it fails.** The relay returns a 5xx (or the HTTP call times out) on the batched kind:39002 query during a channel-list refresh. `query_relay(...).await.unwrap_or_default()` yields an empty Vec, `collect_members_by_channel` produces an empty map, and the `if let Some(info)` at line 225 never fires — so `member_count` stays at whatever `channel_info_from_event` defaulted it to (0) for every channel. The same failure on the per-channel last-message filters at line 252 leaves `last_message_at` as `None` everywhere. The user sees t …

**Evidence (verified present in the file by Gate A):**
```
.await
        .unwrap_or_default();

        let membership = collect_members_by_channel(&members_events);
```
**Reachable path.** User opens/refreshes the channel list in a shipped build -> frontend invokes get_channels (registered desktop/src-tauri/src/lib.rs:744) -> channels.rs:79 runs primary queries successfully (channels.rs:88-92, 127-136, 147) -> relay returns 5xx/timeout on the enrichment query -> query_relay error (relay.rs:334-337) swallowed by unwrap_or_default at channels.rs:220-221 (member counts) and channels.rs:252 (last-message)  …

**What the verifiers said:**

> Confirmed mechanically, downgraded to low: it is a transient display-degradation issue, not a security or data-integrity problem. Verified: get_channels (channels.rs:79, registered lib.rs:744) propagates errors from its primary queries with `?` (channels.rs:92, :136, :147), but both enrichment queries swallow failures — the batched kind:39002 member-count query at channels.rs:212-221 ends in `.await.unwrap_or_default()`, and t …


---

## Flagged but not confirmed

### Refuted during verification (21)

These were reported by finding agents and then killed by 2-of-3 adversarial
verifiers. They are listed rather than buried, because a refutation is a judgement
and can itself be wrong.

| Location | Claimed | Vote | Claim |
|---|---|---|---|
| `desktop/src-tauri/src/commands/identity.rs:191` | critical claimed | 0/3 | get_nsec is a Tauri command with no access control that returns the raw bech32-encoded secret key to any caller from the renderer/JS context. |
| `desktop/src-tauri/src/commands/pairing.rs:146` | critical claimed | 0/3 | confirm_pairing_sas is a Tauri command that unconditionally proceeds to send the pending payload (which embeds the user's nsec, built in start_pairing |
| `desktop/src-tauri/src/commands/personas/inbound.rs:304` | high claimed | 0/3 | The NIP-09 ownership check in `parse_deletion_coordinate` (L219: `if owner != event.pubkey.to_hex() { return None; }`) is self-referential and therefo |
| `desktop/src/shared/api/relayClosedRecovery.ts:141` | high claimed | 0/3 | A live subscription's reconnect watermark `lastSeenCreatedAt` is set from the raw, unvalidated `created_at` of every inbound relay EVENT, so one event |
| `web/src/shared/lib/nostr-client.ts:135` | high claimed | 0/3 | queryEvents() pushes every relay-supplied EVENT payload straight into the results array and returns it to callers with no signature or id verification |
| `desktop/src-tauri/src/commands/personas/inbound.rs:344` | high claimed | 0/3 | `reconcile_inbound_persona_event` verifies the inbound event's Schnorr signature but never checks that `event.pubkey` equals the local owner's pubkey. |
| `desktop/src-tauri/src/commands/workspace.rs:168` | high claimed | 0/3 | `apply_workspace` takes a `relay_url: String` straight from the renderer and stores it as the process-wide `relay_url_override` with no parsing, schem |
| `mobile/android/app/src/main/kotlin/xyz/block/buzz/mobile/MainActivity.kt:263` | high claimed | 0/3 | handleTranscodeVideoToMp4 invokes MethodChannel.Result (result.success / result.error) from a raw background Thread, violating Flutter's platform-thre |
| `crates/buzz-db/src/user.rs:300` | high claimed | 0/3 | A NIP-OA agent->owner delegation, once materialized, is permanent: `set_agent_owner` only writes when `agent_owner_pubkey IS NULL`, and no code path a |
| `crates/buzz-relay/src/api/bridge.rs:2091` | high claimed | 1/3 | `authorize_moderation_read` — the single gate in front of `GET /moderation/reports`, `/moderation/audit`, and `/moderation/restricted` (mounted public |
| `crates/buzz-relay/src/router.rs:425` | high claimed | 1/3 | When `BUZZ_CORS_ORIGINS` is unset the relay installs `CorsLayer::permissive()` — `Access-Control-Allow-Origin: *` plus `Any` methods and `Any` headers |
| `desktop/src-tauri/src/commands/identity.rs:108` | high claimed | 0/3 | sign_event is an unrestricted signing oracle: it takes an attacker-controlled kind, content, tags, and created_at from the renderer and signs whatever |
| `crates/buzz-persona/src/resolve.rs:311` | high claimed | 0/3 | A persona pack's MCP server entries (from pack-level `.mcp.json` or per-persona frontmatter `mcp_servers:`) are parsed into `command`/`args`/`env` wit |
| `desktop/src/features/messages/useLoadMissingAncestors.ts:65` | high claimed | 0/3 | The ancestor-backfill dedupe set is capped by *evicting* its oldest entries, which destroys the very memory that prevents re-fetching. Once a channel  |
| `desktop/src-tauri/src/commands/pairing.rs:111` | high claimed | 0/3 | start_pairing builds a payload embedding the plaintext nsec entirely in response to a renderer-invoked command, before any peer device has been verifi |
| `crates/buzz-agent/src/mcp.rs:742` | high claimed | 0/3 | `spawn_one` executes `Command::new(&spec.command)` with args/env taken directly from the configured MCP server list (which, via buzz-persona, can orig |
| `crates/buzz-media/src/validation.rs:481` | medium claimed | 0/3 | check_moov_before_mdat advances the top-level atom cursor with an unchecked `offset += atom_size`, where atom_size can be the raw 64-bit extended size |
| `desktop/src/features/messages/hooks.ts:678` | medium claimed | 1/3 | useDeleteMessageMutation.onSuccess removes the deleted message only from the flattened channelMessagesKey cache, not from the window store — violating |
| `desktop/src-tauri/src/commands/profile.rs:111` | medium claimed | 0/3 | `update_profile_at_relay` takes `relay_url` verbatim from the renderer and passes it through `relay_http_base_url` — which does no scheme, host, or al |
| `desktop/src-tauri/src/commands/workspace.rs:176` | medium claimed | 0/3 | `apply_workspace` is a plain Tauri command that accepts an arbitrary `nsec: Option<String>` from the renderer and installs the parsed keypair as the p |
| `desktop/src-tauri/src/commands/messages.rs:231` | medium claimed | 0/3 | `get_forum_posts` hands the frontend a bare `created_at` cursor, which it feeds back as `until` on the next call. `until` without `before_id` compiles |

**The most instructive refutation is F002's near-miss.** The `X-Pubkey` header
finding was reported as **critical** with high confidence and a detailed
impersonation scenario. It survived, but the three verifiers returned **low, high,
and medium** — they did not agree on what the code does, only that something is
there. The median put it at medium. The reason for the spread is real and useful:
the insecure value is the *code* default (`unwrap_or(false)`), but every shipped
deployment recipe sets it safely (`deploy/charts/buzz/values.yaml:108`,
`deploy/compose/.env.example:16`), the relay logs a startup warning, and in that
state it also falls back to a hardcoded, publicly known keypair — so a relay
running this way has already surrendered its identity and is unlikely to be a
production deployment that merely forgot a flag. **Treat F002 as an insecure
default worth closing, not as a live authentication bypass.**

### Triaged out before verification (137)

Verification capacity was 48 findings; 199 were reported and 137 ranked below the
cut after dedup. **These were never verified — they are neither confirmed nor
refuted.** Some are probably real.

| Location | Claimed severity | Claim |
|---|---|---|
| `desktop/src-tauri/src/commands/channels.rs:53` | medium | `query_relay_all` loops fetching 500-event pages until the relay returns a short page. There is no page-count cap, no total-event cap, and no check th |
| `crates/buzz-core/src/filter.rs:25` | medium | reader_authorized_for_event() fails open for the two cleartext, relay-signed, globally-stored P_GATED kinds it does NOT name - member-added (44100) an |
| `desktop/src/features/messages/lib/threading.ts:35` | medium | getThreadReference picks the FIRST `e` tag marked "root" (`eventTags.find(...)`) but the LAST `e` tag marked "reply" (line 37, `[...eventTags].reverse |
| `crates/buzz-relay/src/handlers/req.rs:1077` | medium | The kindless-`ids` read exemption is only revoked for the two kinds in `RESULT_GATED_KINDS`, but `P_GATED_KINDS` (buzz-core/src/kind.rs:146) lists six |
| `crates/buzz-relay/src/handlers/event.rs:307` | medium | The Redis cross-pod live fan-out path applies only `filter_fanout_by_access`, which gates AUTHOR_ONLY_KINDS (line 139) and SHARED_GATED_KINDS (line 15 |
| `mobile/lib/features/pairing/pairing_crypto.dart:142` | medium | `parseNostrpairUri` accepts relay URLs from a scanned QR code after checking only that the scheme is `ws` or `wss` — no host validation whatsoever. Th |
| `mobile/lib/features/channels/channel_messages_provider.dart:88` | medium | The open-channel live subscription filters with since = local wall-clock now with zero skew allowance, so any incoming message whose sender-signed cre |
| `mobile/lib/features/channels/read_state/read_state_manager.dart:388` | medium | _publish silently drops a scheduled publish when another publish is in flight (if (_isPublishing) return;) without rescheduling, and dispose() only fl |
| `desktop/src/features/messages/lib/formatTimelineMessages.ts:291` | medium | The custom-emoji URL for a reaction is lifted verbatim out of the reacting event's `["emoji", shortcode, url]` tag with no scheme or shape validation, |
| `crates/buzz-db/src/dm.rs:168` | medium | create_dm uses a plain SELECT-then-INSERT for its idempotency check under READ COMMITTED, so when two requests open the same DM concurrently the loser |
| `desktop/src/shared/api/customEmoji.ts:124` | medium | The community custom-emoji palette resolves shortcode collisions purely by comparing attacker-chosen `event.created_at` values with no upper bound, so |
| `desktop/src/shared/ui/markdown.tsx:1720` | medium | The custom `emoji` element's `src` is a relay-supplied NIP-30 tag value that is rendered as an `<img src>` with no scheme allowlist, and — because it  |
| `desktop/src/shared/lib/maskedLink.ts:17` | medium | The anti-phishing masked-link check fails open: any href whose scheme is not http/https makes `isMaskedLink` return `false` ("not masked"), so the des |
| `desktop/src/shared/api/readOnlyRelayClient.ts:239` | medium | History subscriptions accumulate every relay-supplied EVENT frame into an unbounded in-memory array; the `limit` the client puts in its REQ filter is  |
| `crates/buzz-db/src/event.rs:764` | medium | count_events_on silently ignores EventQuery::shared_gated_reader. The SELECT builder query_events_on applies the shared-gate visibility clause at even |
| `crates/buzz-relay/src/handlers/req.rs:326` | medium | When a historical-delivery DB query fails mid-REQ, the handler sends EOSE — the NIP-01 "end of stored events" success signal — and returns, silently t |
| `crates/buzz-relay/src/handlers/req.rs:397` | medium | A single transient full send buffer during historical delivery aborts the REQ without ever sending EOSE, while the connection stays open and the subsc |
| `crates/buzz-relay/src/handlers/ingest.rs:2605` | medium | For kind:9007 (NIP-29 create-group) the channel row is created in the DB at ingest.rs:2497 before imeta validation runs at ingest.rs:2605-2613. An ime |
| `crates/buzz-relay/src/api/bridge.rs:833` | medium | The HTTP NIP-98 event-submission path builds its IngestAuth with Scope::all_known() — which includes AdminChannels and AdminUsers — so the ingest scop |
| `desktop/src/shared/api/relayReconnectReplay.ts:171` | medium | On reconnect the per-subscription replay window's since is derived from lastSeenCreatedAt (the max created_at seen on the live subscription); created_ |
| `crates/buzz-media/src/storage.rs:232` | medium | read_sidecar_mime collapses every get_sidecar failure — transient S3 5xx/timeout/connection reset and malformed sidecar JSON alike — into None via `.o |
| `crates/buzz-media/src/validation.rs:362` | medium | The 3840x2160 resolution cap reads `track.width()`/`track.height()`, which in mp4-0.14.0 (src/track.rs:150-163) return the `avc1` VisualSampleEntry's  |
| `crates/buzz-media/src/upload.rs:141` | medium | The blob is PUT to S3 before metadata generation, and the comment justifies the resulting orphans as negligible because blobs are "content-addressed". |
| `crates/buzz-media/src/validation.rs:554` | medium | The JPEG APP0 exemption is documented as accepting only canonical JFIF headers whose "lengths and identifiers are fixed", but the accepted length is p |
| `crates/buzz-media/src/validation.rs:200` | medium | The generic-file path takes its canonical extension straight from infer's table when file_mime_to_ext has no mapping, and infer 0.19 emits exactly one |
| `crates/buzz-relay/src/handlers/event.rs:802` | medium | In `handle_ephemeral_event`'s kind:20001 presence branch, the 128-byte length cap is applied only on the bare-string branch (`else if raw.len() > 128` |
| `crates/buzz-relay/src/connection.rs:608` | medium | `enforce_ws_admission` reads the connection's auth state and returns `true` (admit, no counter incremented) for every connection that is not yet Authe |
| `crates/buzz-relay/src/api/git/transport.rs:194` | medium | The git HTTP routes are the only NIP-98-authenticated surface in the relay that never marks the token in the shared replay seen-set. Every other NIP-9 |
| `crates/buzz-acp/src/acp.rs:1074` | medium | Every outbound JSON-RPC request is serialized in full and written to a tracing event at debug level before it is sent. The `session/new` request built |
| `crates/buzz-relay/src/handlers/side_effects.rs:266` | medium | NIP-09 deletion authorization resolves the target event's author with `effective_message_author`, which — for any event signed by the relay's own key  |
| `crates/buzz-auth/src/rate_limit.rs:100` | medium | Three of the seven RateLimitConfig knobs — agent_standard_api_calls_per_min, agent_elevated_messages_per_min, agent_platform_messages_per_min — are pa |
| `crates/buzz-acp/src/lib.rs:1336` | medium | A malformed BUZZ_AUTH_TAG is discarded silently by `.ok()` with no log line, so the agent connects with no NIP-OA owner attestation and fails membersh |
| `crates/buzz-auth/src/nip42.rs:26` | medium | The NIP-42 URL normalizer collapses `localhost` and `::1` into `127.0.0.1`, while its NIP-98 sibling in the same crate deliberately does not and docum |
| `crates/buzz-media/src/validation.rs:352` | medium | validate_video_file guards the divisor (timescale==0) before calling mp4::Mp4Track::duration(), but not the dividend. The mp4 crate computes `self.tra |
| `desktop/src/features/messages/lib/openPopoverLink.ts:17` | medium | Any href that is not a recognized `buzz://message?...` deep link (including arbitrary custom URI schemes, `file://`, or other `buzz://` sub-paths craf |
| `crates/buzz-core/src/filter.rs:23` | medium | reader_authorized_for_event() — documented as closing the 'kindless ids:[…] lookup' read-authorization bypass for every relay delivery surface (WS his |
| `crates/buzz-relay-mesh/src/membership.rs:120` | medium | Gossip records applied via apply_gossip_record (and the underlying GossipState::apply_delta in gossip.rs) are keyed only by an unauthenticated runtime |
| `desktop/src/shared/api/relayClientSession.ts:848` | medium | Events arriving over the live WebSocket subscription (`EVENT` frames) are dispatched straight to UI subscribers (`handleEvent` -> `eventBuffer` -> `su |
| `crates/buzz-auth/src/lib.rs:134` | medium | AuthService::verify_auth_event grants Scope::all_known() — which includes AdminChannels and AdminUsers — to every successfully NIP-42-authenticated co |
| `crates/buzz-auth/src/nip98_replay.rs:95` | medium | The Nip98ReplayGuard::try_mark default method forwards ttl_secs to try_mark_in_scope completely unclamped; the floor (DEFAULT_REPLAY_TTL_SECS) and cei |
| `desktop/src/features/agents/useAgentManagement.ts:143` | medium | An agent-originated update request targets a persona to edit purely by case-insensitive display-name match across ALL locally editable personas, not b |
| `desktop/src-tauri/src/native_websocket.rs:193` | medium | The egress guard on the native-websocket send path (`send_message`) only inspects `WebSocketMessage::Text` and `WebSocketMessage::Binary` frames for t |
| `crates/buzz-ws-client/src/message.rs:77` | medium | parse_relay_message deserializes a relay-supplied EVENT frame into a typed nostr::Event via serde_json and hands it straight to the caller (as RelayMe |
| `desktop/src/features/messages/lib/useMediaUpload.ts:339` | medium | fillSlot writes a descriptor at a stale slot index with no bounds check against the current slots array. When setPendingImeta replaces/shrinks the slo |
| `desktop/src-tauri/src/commands/personas/inbound.rs:194` | medium | `reconcile_inbound_persona_event` gates only on Schnorr signature validity, never on whether `event.pubkey` equals the local identity. A signature pro |
| `desktop/src-tauri/src/commands/notifications.rs:58` | medium | `show_native_notification` is an unauthenticated Tauri command that spawns one detached OS thread per invocation, and each thread blocks in `handle.wa |
| `desktop/src-tauri/src/commands/personas/snapshot/import.rs:545` | medium | `confirm_agent_snapshot_import`'s phase-3a store block has no rollback. It commits the AgentDefinition (`save_personas`, line 475), enqueues the kind: |
| `desktop/src-tauri/src/commands/profile.rs:61` | medium | `update_profile` does a read-merge-write of the user's kind:0: it takes the relay's response, parses `ev.content` as JSON, and folds `name`, `picture` |
| `desktop/src-tauri/src/commands/messages.rs:504` | medium | `resolve_thread_ref` fetches the parent event from the relay and walks its `e` tags to pick the thread root, with no `verify()` on the returned event  |
| `desktop/src-tauri/src/commands/team_snapshot.rs:521` | medium | `confirm_team_snapshot_import` caps the snapshot file at 25 MiB JSON / 50 MiB PNG (team_snapshot.rs:29-30, enforced in `decode_team_snapshot_from_byte |
| `desktop/src/features/messages/lib/formatTimelineMessages.ts:245` | medium | The edit-overlay map is built with no check that the kind:40003 event's signer is the author (or the agent-owner) of the message it targets: the loop  |
| `mobile/lib/features/channels/message_content.dart:52` | medium | When a tapped markdown link points at a relay media URL, `openDownloadedFileProvider` writes the response body to a temp file whose name — and therefo |
| `mobile/lib/features/channels/unread_badge/should_notify_for_event.dart:19` | medium | `shouldNotifyForEvent` evaluates the sender-controlled `broadcast` tag and `p` tags BEFORE it consults the user's mute sets. `mutedChannelIds` is only |
| `mobile/lib/shared/relay/relay_session.dart:452` | medium | `fetchHistory` sends a REQ carrying a `limit` (NostrFilter.limit, default 100, serialized at nostr_models.dart line 239) but the client never enforces |
| `mobile/android/app/src/main/kotlin/xyz/block/buzz/mobile/MainActivity.kt:235` | medium | The MediaMuxer remux copies track formats via addTrack(format) but never calls muxer.setOrientationHint() with the source's rotation, and MediaMuxer d |
| `mobile/lib/shared/community/community_storage.dart:22` | medium | The user's Nostr private key (nsec) is persisted through `const FlutterSecureStorage()` with no platform options at all. flutter_secure_storage 10.x d |
| `desktop/src/shared/lib/remarkCustomEmoji.ts:145` | medium | Custom emoji are emitted as a non-HTML hast element (`hName: "emoji"`) with the attacker-supplied URL set directly as `hProperties.src`. react-markdow |
| `crates/buzz-db/src/thread.rs:489` | medium | get_thread_replies_on silently skips rows that fail event reconstruction, but unlike get_channel_window it has no limit+1 has_more probe — clients der |
| `crates/buzz-core/src/filter.rs:19` | medium | The doc contract on reader_authorized_for_event asserts it guards live fan-out in event.rs, but the live-delivery chokepoint never calls it, and the f |
| `crates/buzz-db/src/channel.rs:758` | medium | get_accessible_channel_ids returns every open channel in the community with no LIMIT and no cap, unlike its sibling get_accessible_channels which caps |
| `crates/buzz-relay/src/api/admin/auth.rs:13` | medium | The deployment-admin plane — the one surface whose DB layer (crates/buzz-db/src/admin_moderation.rs, whose own module doc says it is "the only moderat |
| `crates/buzz-relay/src/handlers/ingest.rs:2121` | medium | `get_channel` failures are collapsed to `None` with `.ok()`, and the archived-channel gate at ingest.rs:2320-2326 only rejects when the row is `Some(. |
| `crates/buzz-media/src/auth.rs:105` | medium | Blossom kind:24242 tokens have no one-time-use / seen-event-id guard anywhere in the verification path. verify_blossom_auth_event_for_verb bounds fres |
| `crates/buzz-relay/src/api/media.rs:496` | medium | Media reads are unauthenticated by default: require_media_get_auth is parsed with .unwrap_or(false) (crates/buzz-relay/src/config.rs:742-749) and, whe |
| `crates/buzz-relay/src/handlers/imeta.rs:242` | medium | `verify_imeta_blobs` loops over every `imeta` tag on an ingested event and issues at least two object-store round trips per tag — `get_sidecar` (line  |
| `crates/buzz-acp/src/acp.rs:1043` | medium | `write_ndjson` mirrors every outbound JSON-RPC frame verbatim onto the observer bus as an `acp_write` event, with no redaction of any field. Because t |
| `crates/buzz-acp/src/relay.rs:3561` | medium | Inbound relay EVENT frames are deserialized into `nostr::Event` and forwarded to the harness with no id or signature verification — `parse_relay_messa |
| `crates/buzz-relay/src/handlers/auth.rs:278` | medium | The connection is marked Authenticated and registered in the pubkey registry only after several further database round-trips following the ban check,  |
| `desktop/src/shared/ui/markdown.tsx:1334` | medium | Markdown links parsed from relay-delivered message content are opened via `openUrl(href)` (Tauri's shell/OS opener) from the right-click "Open link" m |
| `crates/buzz-dev-mcp/src/paths.rs:4` | medium | `resolve_path` (used by `read_file`, `str_replace`, and `view_image`) explicitly performs no containment check against the workspace root — any absolu |
| `desktop/src/features/channels/useUnreadChannels.ts:422` | medium | A relay event's `created_at` is taken raw as the channel's "latest observed" timestamp and is later folded into the published NIP-RS read marker with  |
| `desktop/src/features/messages/lib/dateFormatters.ts:42` | medium | `formatTime` feeds an unvalidated `created_at` into `Intl.DateTimeFormat.prototype.format`, which throws `RangeError: Invalid time value` for any Date |
| `crates/buzz-core/src/event.rs:33` | low | `StoredEvent::is_verified()` has zero call sites in the entire workspace (verified by grep across .rs, .ts and .dart). The `verified` field it exposes |
| `crates/buzz-relay/src/api/git/transport.rs:168` | low | For git HTTP routes, the HTTP method passed as expected_method into buzz_auth::nip98::verify_nip98_event is extracted from the signed event's own meth |
| `desktop/src/features/channels/useUnreadChannels.ts:806` | low | The catch-up effect's cleanup unconditionally releases the caughtUpChannelsRef claims for every channel in toFetch, including channels whose catch-up  |
| `desktop/src/features/messages/useFetchOlderMessages.ts:70` | low | The shouldContinue cancellation guard passed to pageOlderMessagesUntilRowFloor is a tautology: channelId is derived from channel?.id in the same rende |
| `desktop/src/features/messages/useLoadMissingAncestors.ts:92` | low | useLoadMissingAncestors has no call sites anywhere in desktop/src (verified by grep), and its implementation is doubly broken if revived: it merges fe |
| `desktop/src-tauri/src/commands/profile.rs:370` | low | `get_presence` resolves the subject of a kind:20001 presence event from its `p` tag when present, falling back to the event author only if no `p` tag  |
| `crates/buzz-core/src/filter.rs:35` | low | `filter_match_one` evaluates `kinds`, `authors`, `since`, `until`, `ids` and `generic_tags`, but never reads `Filter::search` (present in nostr 0.44.6 |
| `mobile/lib/shared/relay/relay_socket.dart:171` | low | Relay frames are consumed with unchecked casts (data[0] as String here; data[1] as String / data[2] as bool in _handleOk; data[2] as Map and per-eleme |
| `mobile/lib/shared/relay/relay_socket.dart:87` | low | A stream error during NIP-42 auth triggers _onDisconnected twice for the same connection generation: once from the onError handler and once from conne |
| `mobile/lib/features/pairing/pairing_provider.dart:148` | low | `_cleanup()` tears down the socket and the consent flags but never clears the session's key material: `_ephemeralPrivkey`, `_ephemeralPubkey`, `_sessi |
| `mobile/lib/features/invites/invite_join_provider.dart:77` | low | `InviteJoinNotifier.prepare` switches the active community with zero user confirmation when the invite's relay origin matches one the user already has |
| `crates/buzz-db/src/dm.rs:264` | low | list_dms_for_user paginates on a timestamp-only cursor with a strict `updated_at < $3` comparison and no id tiebreak, so any DM whose updated_at exact |
| `crates/buzz-core/src/kind.rs:202` | low | SHARED_GATED_KINDS omits KIND_TEAM (30176) and KIND_MANAGED_AGENT (30177), and neither kind appears in AUTHOR_ONLY_KINDS or P_GATED_KINDS, so any auth |
| `crates/buzz-sdk/src/builders.rs:192` | low | mention_tags caps the number of mentions and lowercases them but never validates that each entry is a 64-character hex pubkey, so build_message (line  |
| `crates/buzz-sdk/src/builders.rs:570` | low | build_add_member and build_remove_member validate the target pubkey with check_hex_len(target_pubkey, 64, ...), which is a MINIMUM-length check (build |
| `crates/buzz-media/src/storage.rs:141` | low | The `if response.status_code == 404` branch in get_stream is unreachable. buzz-media enables rust-s3's `fail-on-err` feature (Cargo.toml:24), and unde |
| `crates/buzz-media/src/bucket_index.rs:295` | low | Orphan accounting sums only blob_variant_bytes and never thumb_bytes, so an orphaned image's thumbnail bytes land in no gauge at all — not orphan_blob |
| `crates/buzz-auth/src/access.rs:60` | low | The entire `access` module — require_scope, check_read_access, check_write_access, and the ChannelAccessChecker trait — has no production caller anywh |
| `desktop/src/shared/api/relayClientSession.ts:890` | low | The NIP-42 AUTH handshake can be completed by the relay without the client ever sending an AUTH event: `authRequest.pendingEventId` is initialised to  |
| `crates/buzz-sdk/src/builders.rs:1613` | low | build_moderation_ban (and similarly build_moderation_timeout / build_moderation_resolve_report) accepts an operator-supplied `reason` string and write |
| `desktop/src/features/agents/ui/SecretRevealDialog.tsx:56` | low | When a managed agent is created, its nsec private key is rendered in plaintext directly in the DOM with no mask/reveal gate, unlike the equivalent Pri |
| `deploy/compose/compose.yml:5` | low | The production single-node/VPS deployment bundle (deploy/compose/, name: buzz-prod) defaults the relay container to the floating, mutable `:main` tag  |
| `desktop/src/features/channels/useLiveChannelUpdates.ts:377` | low | syncSubs re-bumps dmSubscriptionStartedAtRef to the local wall clock on EVERY effect run with a non-empty target set — including runs where the DM cha |
| `desktop/src/features/channels/threadActivityStorage.ts:67` | low | readActivityFromStorage validates only that each persisted item is an object with a string id; the other ThreadActivityItem fields (tags, createdAt, c |
| `desktop/src-tauri/src/commands/pairing.rs:537` | low | The WebSocket endpoint for the nsec-carrying pairing session is taken from the main relay's own NIP-11 document field `pairing_relay_url` and accepted |
| `crates/buzz-relay/src/handlers/event.rs:470` | low | The local fan-out path re-implements the owner check instead of calling `buzz_core::filter::reader_authorized_for_event`, and the copy is weaker in tw |
| `mobile/lib/shared/relay/media_image.dart:107` | low | `MediaImageProvider._loadAsync` fetches arbitrary attacker-supplied URLs with `client.get(uri, ...)` and materializes the entire response into memory  |
| `mobile/lib/features/channels/channels_provider.dart:142` | low | The kind:39002 membership pagination advances with until = min(created_at) - 1, which skips any remaining membership events sharing the boundary secon |
| `mobile/lib/shared/crypto/nip44.dart:123` | low | `_unpad` validates only that the declared length fits inside the buffer (`2 + len > padded.length`); it never checks that the buffer is exactly the ca |
| `mobile/lib/features/channels/message_content.dart:51` | low | When a message link points at relay-hosted media, the app downloads the bytes and hands the file to the OS via `OpenFilex.open`, naming it from the ma |
| `crates/buzz-db/src/dm.rs:107` | low | create_dm validates the 2-9 participant count BEFORE compute_participant_hash deduplicates, so a caller passing the same pubkey twice ([x, x]) passes  |
| `crates/buzz-db/src/thread.rs:522` | low | get_thread_summary selects one thread_metadata row per event_id with LIMIT 1 and no ORDER BY, even though the table's primary key (community_id, event |
| `crates/buzz-db/src/workflow.rs:899` | low | update_workflow_run re-stamps completed_at with NOW() on every call whose status is terminal, without the `IS NULL` guard that the adjacent started_at |
| `crates/buzz-core/src/pairing/qr.rs:148` | low | decode_qr parses the pairing URI's protocol version with `.ok()`, silently discarding a parse failure and falling back to version 1, so a URI that dec |
| `desktop/src/shared/api/relayClosedRecovery.ts:84` | low | A relay-controlled CLOSED message string decides whether a live subscription is retried or permanently deleted, so a single crafted CLOSED frame silen |
| `crates/buzz-db/src/lib.rs:156` | low | insert_mentions builds one multi-row INSERT with six bind parameters per valid `p` tag and applies no cap on the number of tags, even though the SDK c |
| `crates/buzz-db/src/lib.rs:3415` | low | `Db::get_api_token_by_hash`, documented one line above as the lookup for an "active (non-revoked) API token", filters on `revoked_at IS NULL` only and |
| `crates/buzz-relay/src/connection.rs:428` | low | The "frame too large" NOTICE is queued on the data channel and then the recv loop breaks, which triggers `cancel.cancel()`; the send loop's biased can |
| `desktop/src/shared/api/relayReconnectReplay.ts:116` | low | The reconnect history-paging loop advances pageUntil by at most one second when a full 500-event page shares the oldest created_at, so if more than 50 |
| `crates/buzz-media/src/validation.rs:644` | low | The PNG chunk allowlist is gated on `ancillary`, computed as `kind[0] & 0x20 != 0` (line 629). Any chunk whose first byte is uppercase is a *critical* |
| `crates/buzz-relay/src/router.rs:139` | low | `crates/buzz-relay/src/api/git/policy.rs:24` states as a security invariant that the internal git push-policy endpoint "binds to 127.0.0.1 only (enfor |
| `crates/buzz-acp/src/relay.rs:379` | low | If NIP-98 signing fails, `unwrap_or_default()` substitutes an empty string for the Authorization header, so the request is sent unauthenticated and th |
| `desktop/src/features/messages/lib/customEmojiNode.ts:186` | low | `renderHTML` takes `node.attrs.src` (ultimately derived from another member's NIP-30 kind:30030 `emoji` tag URL, resolved via `resolveUrl`) and passes |
| `crates/buzz-core/src/observer.rs:84` | low | decrypt_observer_payload() decrypts NIP-44 content keyed off event.pubkey without ever calling event.verify()/verify_signature(), unlike buzz-core's o |
| `crates/buzz-db/src/event.rs:368` | low | query_events_on clamps `limit` to DEFAULT_MAX_PAGE_LIMIT (or the caller's max_limit) but leaves `offset` completely unbounded, even though offset is p |
| `crates/buzz-media/src/config.rs:49` | low | MediaConfig derives Debug while holding s3_secret_key (and s3_access_key) as plain String fields, so any future `{:?}`/`tracing::debug!`/panic-message |
| `desktop/src/features/agents/lib/personaCatalogRelay.ts:172` | low | The persona catalog projection accepts an attacker-controlled `system_prompt` (and `runtime`/`provider`/`model`) of unbounded length/content from any  |
| `desktop/src-tauri/src/media_proxy.rs:38` | low | The local media-proxy origin check only rejects requests when the Origin header is present and mismatched; a request with no Origin header at all is l |
| `crates/buzz-audit/src/service.rs:185` | low | verify_chain only checks that hashes are internally consistent within the requested [from_seq, to_seq] window (expected_prev starts at None and is onl |
| `desktop/src-tauri/src/commands/social.rs:214` | low | `get_note_reactions` folds NIP-09 deletions without checking who authored them: the kind:5 filter carries `#e` and no `authors`, and `deleted_event_id |
| `crates/buzz-core/src/observer.rs:94` | low | decrypt_observer_payload() (and decrypt_agent_turn_metric wrapping it, agent_turn_metric.rs:189) NIP-44-decrypts keyed on the attacker-controllable ev |
| `crates/buzz-core/src/kind.rs:831` | low | The module header asserts 'All constants are `u32` — NIP-01 specifies kind as an unsigned integer, and u32 covers the full range without truncation' ( |
| `mobile/android/app/src/main/AndroidManifest.xml:16` | low | The `<application>` element declares no `android:allowBackup="false"`, no `android:dataExtractionRules` and no `android:fullBackupContent`. Android's  |
| `mobile/lib/shared/community/community_provider.dart:43` | low | addCommunity builds its optimistic list from state.value ?? [] without awaiting the initial build, so if it runs while the community list is still loa |
| `mobile/lib/shared/mentions/agent_identity_provider.dart:249` | low | Channel bot/agent identity is taken from an unauthenticated kind:39002 event. `NostrFilters.channelMembers` (nostr_filters.dart:22-28) filters only on |
| `desktop/src/features/profile/ui/NostrBindConsentDialog.tsx:137` | low | The signed Nostr identity-binding response is returned by opening an attacker-controlled `callbackUrl` from the `buzz://` deep link via the OS opener, |
| `crates/buzz-db/src/feed.rs:92` | low | All three feed query builders clamp limit only from above (limit.min(FEED_MAX_LIMIT)) with no floor, so a zero or negative i64 limit is bound directly |
| `crates/buzz-core/src/filter.rs:83` | low | The #h fallback treats an event's explicit h tags as authoritative for channel matching, but ingest deliberately ignores h tags on global-only kinds a |
| `crates/buzz-core/src/git_perms.rs:239` | low | UpdateKind::classify hardcodes the 40-character SHA-1 zero OID, so in a SHA-256 repository a ref deletion (64-character zero new_oid) is classified No |
| `crates/buzz-sdk/src/builders.rs:256` | low | `build_agent_observer_frame`'s guard that the payload is encrypted is a length-range test, not a ciphertext test: `content_looks_like_nip44` (crates/b |
| `crates/buzz-relay/src/api/bridge.rs:69` | low | The primary bridge endpoints /events, /query and /count authenticate via verify_bridge_auth, which calls verify_bridge_auth_with_options with require_ |
| `crates/buzz-media/src/upload.rs:120` | low | The idempotent short-circuit builds the returned BlobDescriptor from the freshly re-sniffed `ext`/`mime` rather than from the sidecar it just read (`m |
| `crates/buzz-media/src/upload.rs:342` | low | The streaming video pipeline creates a NamedTempFile (upload.rs:302), immediately discards the securely-created handle in favour of its path (upload.r |
| `crates/buzz-relay/src/handlers/req.rs:181` | low | The WebSocket REQ handler runs the three sensitive-kind filter gates — `p_gated_filters_authorized`, `engram_filters_authorized`, `author_only_filters |
| `crates/buzz-relay/src/handlers/event.rs:681` | low | Both WebSocket scope gates in this file are written as `!scopes.is_empty() && !scopes.contains(...)`, so an AuthContext carrying an empty scope vector |

### Flagged by tooling, exploitability unconfirmed

| Source | Finding |
|---|---|
| `cargo audit` | RUSTSEC-2026-0194 / -0195 — `quick-xml` quadratic parse and unbounded namespace allocation, both 7.5 high, both DoS. **Two versions (0.38.4 and 0.39.4) are in the tree simultaneously**, so a single bump will not clear it. Present in the Tauri workspace too. |
| `cargo audit` | Unsound: `event-listener 5.4.1` (RUSTSEC-2026-0221), `glib 0.18.5` (RUSTSEC-2024-0429, Tauri workspace only). Unmaintained: `instant`, `paste`, `unic-ucd-version`. Yanked: `async-utility 0.3.1`, `spin 0.9.8`, `spin 0.10.0`. |
| `pnpm audit --prod` | GHSA-6v5v-wf23-fmfq — `markdown-it ≤ 14.1.1` quadratic DoS, reached via `desktop > tiptap-markdown > markdown-it`. This is the **message renderer parsing attacker-authored content**, so reachability is plausible. Fixed in 14.1.2. |
| `semgrep` | `detected-private-key` in `desktop/src-tauri/src/commands/agent_discovery/install_report_redaction_tests.rs:306`; `detected-telegram-bot-api-key` in `docs/nips/NIP-MP.fixtures.json:1250`. Both look like test fixtures — **confirm they are not live credentials.** |
| `semgrep` | 8 `detect-non-literal-regexp` hits where user-controlled input is compiled into a regex (`mentionPattern.ts:36,43`, `customEmojiNode.ts:101`, `hasMention.ts:145`, `mentionHighlightExtension.ts:109,124`, `remarkCustomEmoji.ts:44`) — a ReDoS surface nobody traced. |
| `cargo clippy` (strict) | **795 hits never triaged**: 368 arithmetic-with-side-effects, 204 "indexing may panic", 67 truncating casts, 57 "slicing may panic", 22 `unwrap`. Used only as corroboration; only 11 findings landed near one. |

---

## Coverage gaps — what this audit did not examine

Produced by three completeness critics whose only job was to find what the audit
missed. This is the section to read if you are deciding where to look next.

### The gap we consider most serious

**No lens looked for indirect prompt injection or agent confused-deputy** — the
vulnerability class most specific to this product. The three depth lenses were
hostile input, cryptography/identity, and correctness. None asked what happens
when relay-delivered message text reaches an LLM prompt and then a shell command.
For a Nostr client that runs managed coding agents, this was designed out of the
audit before it began.

### An error in our own static-analysis coverage, found by the critics

We reported the workspace as clippy-clean. That was too broad. The root
`Cargo.toml:32` declares `exclude = ["desktop/src-tauri"]` and the Tauri backend
is its own workspace, so **354 Rust files were never linted** — including every
`unsafe` block in the repository. Re-running inside `desktop/src-tauri/`:
`cargo audit` worked and is reported above; `cargo clippy` **cannot build** (a
missing prebuilt `buzz-acp` sidecar and a missing CMake toolchain for
`audiopus_sys`), and `cargo check` fails on the same `build.rs`. That code has no
lint coverage at all.

### Large subsystems that were barely read

| Subsystem | Size | State |
|---|---|---|
| `desktop/src-tauri/src/managed_agents/` | ~37,000 lines | "Essentially unexamined" per its own auditor — **and it is where the `unsafe` code lives** |
| `crates/buzz-acp` | 36,136 lines | ~19,000 lines never opened; every auth auditor independently skipped `acp.rs` (4,495 lines) |
| `crates/buzz-relay/src/api/git/` | 9,858 lines | ~70% unread — `cas_publish.rs` (1,884), `store.rs` (1,214) never opened |
| `crates/buzz-relay/src/audio/` | 5,836 lines | Only ~1 file read — **yet it produced F009, a high finding** |

A high-severity finding emerging from a barely-read subsystem is a warning about
what else is in there, not a sign that it was covered.

### Slices that returned suspiciously little for their size

| Slice | Files read | Findings |
|---|---|---|
| mobile | 13 | 1 |
| gateway-mesh (buzz-push-gateway, buzz-pubsub, buzz-relay-mesh, buzz-pair-relay) | 23 | 1 |
| media (crates/buzz-media) | 12 | 1 |
| desktop-rest | 30 | 1 |
| supply-chain | 24 | 1 |
| desktop-messages | 19 | 2 |

### Full gap list

The three critics overlapped heavily; near-duplicates are merged below
(50 raw gap statements collapsed to 49 distinct ones).


**[high]** No lens looked for indirect prompt injection or agent tool-authorization. The three lenses were hostile input / crypto-identity / correctness; none asked "what happens when untrusted relay text becomes an LLM prompt that drives tool calls." This is the platform's defining feature and its trust boundary was never modelled. Concretely: crat

*Follow-up:* Run a fourth lens ("agent trust boundary") over the path: crates/buzz-acp/src/lib.rs (author gate + event->prompt), pool.rs (session/new, apply_permission_mode at pool.rs:999-1107), queue.rs (turn scheduling), crates/buzz-agent/src/llm.rs (

**[high]** crates/buzz-acp is 36,136 lines and roughly 19,000 of them were never opened by any pass. Every auth-slice auditor justified skipping acp.rs (4495), pool.rs (6864), queue.rs (4759), usage.rs (1514), setup_mode.rs (1135) and pool_lifecycle.rs (312) on the grounds that grep showed no `buzz_auth` call — but that argument only rules out authn

*Follow-up:* Read crates/buzz-acp/src/pool.rs, queue.rs and acp.rs end to end with a hostile-input lens, focusing on the ACP JSON-RPC transport (acp.rs:430-540, 1025-1090), session rotation/reuse across authors, and any unbounded `unbounded_channel`/`Ve

**[high]** desktop/src-tauri/src/managed_agents/ is 52 files and 19,452 lines and was described by the tauri-core auditor as "essentially unexamined." The three deep tauri-commands passes only touched backend.rs, storage.rs, personas.rs and persona_events.rs. Never opened: readiness.rs (1743), discovery.rs (1643), custom_harnesses.rs (1231), runtime

*Follow-up:* Dedicated pass over custom_harnesses.rs, discovery.rs, runtime.rs and agent_snapshot.rs tracing a hostile persona/team snapshot from personas/inbound.rs into harness resolution and process spawn; check for path traversal in harness install 

**[high]** The relay's audio/huddle subsystem is 5,836 lines across six files (handler.rs, join.rs 1600+, room.rs 790, mesh.rs, wire.rs 168, mod.rs) and only ~200 lines of handler.rs were ever read (lines 150-300 and 1153-1215). The audit's single HIGH relay finding — crates/buzz-relay/src/audio/handler.rs:244, missing community-ban gate — sits insi

*Follow-up:* Read crates/buzz-relay/src/audio/{join,room,mesh,wire}.rs in full and enumerate every point where a pubkey gains room membership; check each against handlers/auth.rs:96-100's stated invariant that a ban must block at connection auth. Then r

**[high]** crates/buzz-relay/src/api/git/ is 9,858 lines of git smart-HTTP server and most of it was never opened: cas_publish.rs (1884), store.rs (1214), hydrate.rs (901), manifest.rs (570), manifest_event.rs (395), and ~2,200 of transport.rs's 2,819 lines. Only mod.rs (67), hook.rs (207), binding.rs (128), pack_cache.rs (686) and the first 300-400

*Follow-up:* Hostile-input pass over api/git/cas_publish.rs, store.rs and hydrate.rs plus the unread body of transport.rs: trace an attacker-controlled push from the HTTP body to the object store, checking ref-name sanitisation, object size/count caps, 

**[high]** No static analysis produced ground truth for TypeScript or Dart, the two languages carrying the audit's HIGH findings. mobile/analysis_options.yaml exists but `dart analyze` / `flutter analyze` was never run; biome.json exists at the repo root but `biome check` and `tsc --noEmit` were never run; the only JS-side tool that ran was `pnpm au

*Follow-up:* Run `flutter analyze` in mobile/, `pnpm biome check` and `pnpm tsc --noEmit` across desktop/web/admin-web, and triage the output against the reported findings. Separately, write two throwaway tests that actually construct a two-e-tag kind:4

**[high]** Two media auditors reached opposite conclusions on the same HIGH finding and nobody adjudicated. crates/buzz-media/src/validation.rs:270 (`imagesize::blob_size` gate, MAX_PIXELS 25M) was reported as a GIF decompression bomb because the logical screen descriptor is measured while thumbnail.rs:26 `image::load_from_memory` allocates from the

*Follow-up:* Construct the fixture: a GIF declaring a 1x1 logical screen and a 65535x2048 image descriptor. Feed it to `validate_image_bytes` then `generate_image_metadata_sync` under a memory-capped test and record actual peak allocation. Resolve the f

**[high]** No lens looked for prompt-injection-to-code-execution: the path where relay-delivered message text becomes an LLM prompt and then a shell command. crates/buzz-agent/src/llm.rs (6,556 lines, prompt/body assembly) and crates/buzz-agent/src/agent.rs (1,048 lines, the tool-dispatch loop `execute_calls`/`invoke_tool_inner`) were explicitly 'NO

*Follow-up:* Run a dedicated prompt-injection lens over crates/buzz-agent/src/{agent.rs,llm.rs,mcp.rs,hints.rs,handoff.rs}, crates/buzz-dev-mcp/src/shell.rs, and crates/buzz-acp/src/{queue.rs,lib.rs}. Trace one concrete chain end to end: attacker posts 

**[high]** The huddle-audio subsystem (crates/buzz-relay/src/audio/, 5,836 lines) is effectively unaudited, yet it produced the audit's only [high]-severity server-side finding. Coverage notes show only audio/handler.rs lines ~150-300 and 1153-1215 were ever opened; audio/join.rs (3,036 lines), audio/room.rs (790), audio/mesh.rs (393) and audio/wire

*Follow-up:* Assign audio/ its own slice with hostile-input and correctness lenses. Start with audio/join.rs's join/offer/answer handlers and audio/room.rs's participant table: check per-message authorization after the initial handshake, whether room st

**[high]** Four confirmed findings sit in files no agent ever read end to end, so the surrounding code is unverified and the findings' 'no other caller does this' claims are unproven: crates/buzz-relay/src/api/bridge.rs (3,769 lines; finding at :118, and the auth Lens-C note says lines 1394-3770 were never opened line-by-line), crates/buzz-relay/src

*Follow-up:* Commission four exhaustive single-file reads (bridge.rs, ingest.rs, audio/handler.rs, req.rs) whose sole deliverable is a call-site table: for bridge.rs every route and the require_auth_token value it passes; for ingest.rs every .expect()/.

**[high]** The desktop agent-execution backend was never audited by anyone. desktop/src-tauri/src/managed_agents/ (52 entries, including backend.rs, process_lifecycle.rs, agent_env.rs, env_vars.rs, git_bash.rs, custom_harnesses.rs, spawn_hash/, nest/) is described by the tauri-core note as 'essentially unexamined'; desktop/src-tauri/src/mesh_llm/ (5

*Follow-up:* Three follow-up passes: (1) managed_agents/{backend.rs,process_lifecycle.rs,agent_env.rs,env_vars.rs,git_bash.rs,custom_harnesses.rs} for command construction, env/secret passthrough and spawn-hash bypass; (2) mesh_llm/{coordinator.rs,recov

**[high]** No fuzzing or differential testing exists or was run: there is no fuzz/ directory and no cargo-fuzz target anywhere in the workspace (proptest appears only as a transitive dependency in Cargo.lock). Every binary-parser conclusion in the audit — crates/buzz-media/src/validation.rs's JPEG/PNG/WebP/GIF/MP4 walkers, crates/buzz-relay/src/prot

*Follow-up:* Add a cargo-fuzz target that feeds the same buffer to buzz_media::validation::validate_* and to the decoder that actually allocates (image::load_from_memory, mp4::Mp4Reader), and asserts the validator's reported dimensions/duration bound th

**[high]** 795 clippy hits from indexing_slicing, arithmetic_side_effects, cast_possible_truncation and unwrap_used were generated and then never triaged — the audit reports the count and moves on. No lens systematically asked 'which of these are reachable from an unauthenticated or attacker-controlled input?'

*Follow-up:* Re-run clippy with those four lints, emit JSON, and filter to hits inside crates/buzz-relay/src/handlers/, api/, audio/, tunnel/ and crates/buzz-media/src/ — i.e. code downstream of a network read. Triage that reduced set by hand for reacha

**[high]** Dependency and lint scanning never touched the desktop app. `Cargo.toml:31` declares `exclude = ["desktop/src-tauri"]`, so `cargo audit`, `cargo clippy --workspace`, and CI's `cargo-deny check` (ci.yml:875, no --manifest-path) all ran against the root workspace only. `desktop/src-tauri/Cargo.lock` is a separate lockfile with 1,201 package

*Follow-up:* Run `cargo audit --file desktop/src-tauri/Cargo.lock`, `cargo deny --manifest-path desktop/src-tauri/Cargo.toml check`, and `cargo clippy --manifest-path desktop/src-tauri/Cargo.toml --all-targets -- -D warnings` (plus the indexing_slicing/

**[high]** `desktop/src-tauri/src/managed_agents/` — 77 files, 37,268 lines — is essentially unexamined, and it is where the repo's unsafe Rust actually lives. The tauri-core auditor said so explicitly ("managed_agents/ in particular … is essentially unexamined"); no other pass covered it. It contains 41 of the repo's 86 `unsafe` sites (runtime/swee

*Follow-up:* Dedicated pass over desktop/src-tauri/src/managed_agents/runtime/{sweep,process,instance_reaper,orphan_sweep}.rs and process_lifecycle.rs auditing every `unsafe` block for PID reuse, handle lifetime, and UID checks; audit the 10 Command::ne

**[high]** `crates/buzz-acp` (36,136 lines, the single largest crate) fell into a slice seam and was never read. It appears in exactly one slice — "auth" — where all three passes independently declined it on the same reasoning: grep showed no `buzz_auth` call, so acp.rs (4,495), pool.rs (6,864), lib.rs (6,676), queue.rs (4,759), config.rs (2,931), u

*Follow-up:* Run a dedicated 3-lens pass on buzz-acp/src/{lib,pool,queue,acp,config}.rs and buzz-agent/src/{agent,llm}.rs, scoped to: how a relay EVENT becomes a turn (lib.rs author gate and respond-to logic), subprocess spawn/env/stdio handling in acp.

**[high]** No lens looked for prompt-injection / agent confused-deputy — the vulnerability class specific to this product. The three lenses were hostile input, crypto and identity, and correctness; none asks "can attacker-controlled text reaching an LLM cause the agent to act with its owner's authority?" The project itself names this threat: crates/

*Follow-up:* Add an explicit fourth lens and run it end-to-end on one path: untrusted channel message -> buzz-acp/src/lib.rs turn construction -> buzz-agent/src/llm.rs prompt assembly -> tool dispatch in agent.rs -> buzz-dev-mcp shell.rs/str_replace.rs.

**[high]** The project's own adversarial test suites were never run and never read. `crates/buzz-test-client/tests/conformance_multitenant.rs` (23 `#[ignore]` cases — the runtime multi-tenant isolation suite), `nip42_host_binding_live.rs` (7), and `regression_relay_admin_ban_gate.rs` (2) are all `#[ignore]`'d per TESTING.md and require a live relay.

*Follow-up:* Stand up the local relay per TESTING.md and run `cargo test -p buzz-test-client -- --ignored`, plus `cargo test -p buzz-conformance`, and triage every failure. Then extend regression_relay_admin_ban_gate.rs with a case that authenticates a 

**[high]** The huddle-audio subsystem holding the audit's only HIGH relay finding was barely read. `crates/buzz-relay/src/audio/` is 5,836 lines; only handler.rs (1,430 lines) was opened, and only ~350 of those (the auth prelude at 150-300 and ensure_membership at 1153-1215). `audio/join.rs` — 3,036 lines, the actual join/room-membership machinery —

*Follow-up:* Read crates/buzz-relay/src/audio/join.rs and room.rs in full to establish whether the ban gap at handler.rs:244 is isolated, and whether room membership/eviction re-checks moderation state after a ban lands mid-call. Then a first pass over 

**[high]** 2,161 lines of formal specification — the project's own strongest statement of what its security properties are — were never opened, and neither was the crate that checks them. `docs/spec/MultiTenantRelay.tla` (1,142 lines) names 12 invariants (Inv_NonInterference, Inv_LabelPropagation, Inv_ReadConfinement, Inv_ResolutionFence, Inv_HostBi

*Follow-up:* Enumerate every HTTP and WS entry point that resolves a tenant (api/bridge.rs, api/media.rs, api/git/transport.rs, api/invites.rs, api/operator.rs, api/admin/mod.rs, audio/handler.rs) and check which arm an EmitGuard — expect only ingest.rs

**[medium]** Eight of the seventeen slices got a breadth pass only and were never revisited by any of the three depth lenses: gateway-mesh, agent-surface, tauri-core, tooling-identity, web, desktop-agents, desktop-rest, supply-chain. The yield reflects it — desktop-rest returned 1 finding from ~604 files (30 read), gateway-mesh returned 1 from four cr

*Follow-up:* Run at least one depth lens on gateway-mesh (correctness: topic refcounting in buzz-pubsub/src/lib.rs:120-300 and cache_invalidation.rs, plus buzz-push-gateway/src/postgres.rs and config.rs) and one on desktop-rest (hostile input). Treat an

**[medium]** The mobile app's native halves are almost entirely unread, and no auditor was assigned Kotlin or Swift. Never opened: mobile/ios/Runner/NativeAttachmentPopover.swift (1089 lines), NativeAttachmentPopoverCoordinator.swift (371), AppDelegate.swift (317, one lens read it), InlinePhotoPicker.swift (248), MediaSanitizer.swift (199), and mobile

*Follow-up:* Read the six native files end to end with a hostile-input lens: what does MediaSanitizer strip and what survives, can InlinePhotoPicker/NativeAttachmentPopover be driven to read a path outside the picked file, and does MainActivity.kt valid

**[medium]** The relay's privilege and provisioning paths were read only as far as their auth preludes. crates/buzz-relay/src/api/invites.rs (1789 lines) — only mint/claim prelude and `authenticate`; api/operator.rs (1252) — only `authorize_operator_request`; handlers/command_executor.rs (1370) — only approval grant/deny and `check_approver_spec`; han

*Follow-up:* Correctness pass over api/invites.rs's full mint/claim lifecycle (single-use enforcement, expiry, community binding), api/operator.rs's post-auth handlers, and handlers/community_provisioning.rs — specifically whether an invite can be redee

**[medium]** Denial of service and resource exhaustion was never a lens; the three DoS-shaped findings that survived (api/media.rs:96 unbounded DashMap, handlers/req.rs:239 leaked subscription + Redis topic refcount, desktop/src/shared/lib/linkPreview.ts:168 quadratic prescan) were all incidental catches during other work. No systematic sweep of unbou

*Follow-up:* Mechanical sweep: grep crates/buzz-relay and crates/buzz-pubsub for `DashMap`, `HashMap`, `Vec::push` and `unbounded_channel` in long-lived state, and for each ask whether the key is attacker-mintable and whether an eviction path exists. St

**[medium]** 24 of the 26 files in migrations/ were never opened. Only 0001, 0006, 0010, 0021 and 0025 were read directly; everything else was inferred from the excerpts quoted inside crates/buzz-db/src/migration.rs's assertions — i.e. the schema was audited through the application's own description of it.

*Follow-up:* Read all 26 files under migrations/ directly and enumerate every UNIQUE index, PRIMARY KEY and FOREIGN KEY, flagging any on a per-community table that does not include community_id. 158 KB total — an hour of work that closes the isolation q

**[medium]** The confirmed admin-API finding (crates/buzz-relay/src/api/admin/auth.rs:6, Host-header-only authorization on moderation reports and product feedback) is correct as read — I confirmed auth.rs compares only `HOST` against `config.admin.host` plus an Origin check — but its severity depends entirely on deployment facts nobody verified. route

*Follow-up:* Read crates/buzz-relay/src/router.rs in full (how admin routes are merged and on which listener) plus deploy/compose/*.yml and deploy/charts/buzz/templates/{ingress,deployment}.yaml, and re-rate the finding with the actual exposure. Also ch

**[medium]** The NIP-OA condition-evaluation defect was reported twice as two findings (crates/buzz-sdk/src/nip_oa.rs:214 and :231) from two different auditors, and both cite buzz-cli/src/commands/users.rs:196's `auth_conditions_apply` as the correct reference implementation — but the tooling-identity auditor explicitly listed buzz-cli/src/commands/us

*Follow-up:* Read buzz-cli/src/commands/users.rs around line 196 and crates/buzz-relay/src/handlers/identity_archive.rs:328 (`enforce_request_auth_time_bounds`) and crates/git-sign-nostr/src/lib.rs:596 (`enforce_conditions`), compare the three independe

**[medium]** Rust static analysis produced signal that nobody triaged. `cargo clippy` was reported clean on default lints, but enabling indexing_slicing / arithmetic_side_effects / cast_possible_truncation / unwrap_used produced 795 hits that were never looked at. `cargo audit` found 4 quick-xml DoS advisories with no reachability analysis. deny.toml 

*Follow-up:* Re-run clippy with those four lints, filter to non-#[cfg(test)] code under crates/buzz-relay/src/handlers, crates/buzz-media/src, crates/buzz-core/src and crates/buzz-db/src, and triage every unwrap_used/indexing_slicing hit that sits downs

**[medium]** Denial-of-service and resource exhaustion was never a lens; the two DoS findings that landed (crates/buzz-relay/src/api/media.rs:96 unbounded DashMap rate-limiter, handlers/req.rs:239 subscription/Redis-topic leak) were both incidental byproducts of reading for something else. Nobody swept crates/buzz-relay/src/state.rs's map declarations

*Follow-up:* Enumerate every DashMap/HashMap/Vec field in crates/buzz-relay/src/state.rs and crates/buzz-relay/src/connection.rs and tabulate: key type, who can insert, and what evicts. Flag every row whose key includes an attacker-choosable pubkey or c

**[medium]** Native mobile code is a fifth language nobody was assigned. ~2,100 lines of Kotlin/Swift were never opened by any of the three mobile passes, each of which explicitly lists them under 'never opened': mobile/ios/Runner/NativeAttachmentPopover.swift (1,089 lines), NativeAttachmentPopoverCoordinator.swift (371), InlinePhotoPicker.swift (248)

*Follow-up:* Run one pass over mobile/ios/Runner/*.swift and mobile/android/.../kotlin/**/*.kt as a named slice. Focus on AndroidMediaSanitizer.kt and MediaSanitizer.swift (does re-encoding actually strip metadata and cap dimensions, or does it pass thr

**[medium]** Dart got zero ground truth from tooling. The static analysis that ran was cargo audit, cargo clippy, pnpm audit --prod and semgrep — and the audit itself records that semgrep's Dart rule coverage is zero. `dart analyze` / `flutter analyze` was never run despite mobile/analysis_options.yaml existing (flutter_lints + custom_lint), and no de

*Follow-up:* Run `dart analyze --fatal-infos` in mobile/ and triage the output; add a supply-chain check over mobile/pubspec.lock (pub.dev advisories / OSV) since the audit never checked Dart dependencies at all; and re-verify the two [high] mobile find

**[medium]** The Tauri IPC attack surface was never enumerated as a whole. desktop/src-tauri/capabilities/default.json grants the main webview `updater:allow-check/download/install`, `process:allow-restart`, `opener:default` and `dialog:default`, and desktop/src-tauri/tauri.conf.json sets `app.security.csp` to null (confirmed: the only security key is

*Follow-up:* Produce one table: every #[tauri::command] in desktop/src-tauri/src/commands/ (97 files), whether it is exposed to the main window by capabilities/default.json, and what it can reach (signing keys, subprocess spawn, filesystem, network). Th

**[medium]** Update-channel and release-artifact integrity was not audited as a class. The supply-chain slice checked CI for injection (pull_request_target, unpinned actions, fork-PR secret exposure) and passed everything, but explicitly skipped 'the mobile/desktop release shell scripts beyond a line-count/spot read' and skimmed the 41KB Justfile. scr

*Follow-up:* Audit .github/workflows/{desktop-release-candidate,release,signed-macos-canary,linux-canary,windows-canary}.yml together with scripts/verify-desktop-release-*.sh, verify-release-ref.sh and test-signed-canary-contract.sh as one trust chain. 

**[medium]** No secret-scanning ran anywhere, and the places secrets usually leak were excluded from scope. There is no gitleaks/trufflehog/detect-secrets step in .github/workflows/ or lefthook.yml (only cargo-deny at ci.yml:875), and the audit explicitly excluded desktop/tests (149 files), mobile/test (97), benchmarks/ (40) and examples/ (10). No len

*Follow-up:* Run gitleaks (or trufflehog) over the full repo and its git history, including the four excluded directories, and add it to lefthook.yml as a pre-commit gate. Separately grep the Rust tree for tracing/log macros whose arguments include a ty

**[medium]** Privacy and metadata leakage was not a lens. Nobody asked what an honest-but-curious relay operator, or the push gateway, learns about users. crates/buzz-push-gateway/ (4,092 lines) received exactly one breadth pass (23 files, 1 finding) and no depth lens, so nothing examined what apns.rs actually puts in a notification payload; crates/bu

*Follow-up:* Run one privacy lens across crates/buzz-push-gateway/src/{apns.rs,grant.rs,model.rs}, crates/buzz-db/src/dm.rs plus migrations/0001's participant_hash index, and crates/buzz-relay/src/handlers/push_lease.rs. Deliverable is a table of what e

**[medium]** Deployment and runtime misconfiguration was not a class anyone swept. The supply-chain slice read deploy/compose/*.yml and exactly one Helm template (deploy/charts/buzz/templates/secret-chart.yaml), explicitly skipping deployment.yaml, ingress.yaml and the rest of the 16 templates. deployment.yaml delegates its pod and container securityC

*Follow-up:* Read deploy/charts/buzz/values.yaml against templates/{deployment,ingress,httproute,quickstart-minio,quickstart-minio-init,serviceaccount}.yaml and record the effective defaults for runAsNonRoot, allowPrivilegeEscalation, capabilities.drop,

**[medium]** Four large slices got a single breadth pass and nothing else, and their returns are implausibly low for their size and risk: desktop-rest (604 files, 30 read, 1 finding), desktop-agents (322 files, 24 read, 2 findings), tauri-core (183 files, 14 read, 3 findings), and tooling-identity (buzz-cli's ~20 unread command modules, plus buzz-audi

*Follow-up:* Run at least a Lens-B (crypto/identity) pass over desktop-rest's onboarding and backup path, and a Lens-C (correctness) pass over desktop-agents' observerRelayStore.ts / agentManagement.ts (agent-originated management requests that create p

**[medium]** Mobile secrets at rest were never assessed, in either the code or the policy. `mobile/lib/shared/community/community_storage.dart:22` constructs `const FlutterSecureStorage()` with no IOSOptions and no AndroidOptions (flutter_secure_storage ^10.0.0, pubspec.yaml:20), and that store holds the nsec — the file's own migration constants inclu

*Follow-up:* Read mobile/lib/shared/community/community_storage.dart with mobile/ios/Runner/Info.plist and android/app/build.gradle.kts, determine the effective keychain accessibility class and Android backing store for flutter_secure_storage 10.x defau

**[medium]** Client-side binary parsers outside Rust got roughly zero attention, while their Rust twin got four passes. crates/buzz-media/validation.rs was read in full by one breadth and three deep passes (including reading the third-party image/gif/png/mp4 decoder sources), and produced the HIGH GIF logical-screen-vs-frame bomb. The same job on the 

*Follow-up:* Run the hostile-input lens over mobile/lib/shared/relay/animated_image_sanitizer.dart and mp4_fast_start.dart with the same bounds-and-differential method used on validation.rs, then read AndroidMediaSanitizer.kt, MediaSanitizer.swift and N

**[medium]** Whole languages and file types got no mechanical ground truth, so those conclusions rest on model reading alone. Dart (50,766 lines in mobile/lib): semgrep's Dart rule coverage is zero by the audit's own admission, and the audit never ran `flutter analyze` even though CI does (ci.yml:857) and mobile/analysis_options.yaml configures flutte

*Follow-up:* Run `cd mobile && flutter analyze` and record what the audit's manual pass missed; run `dart pub outdated` / an OSV scan on the 39 mobile deps; run shellcheck across scripts/, script/, bin/ and deploy/; and read all 26 migrations/*.sql dire

**[medium]** The git-on-object-storage subsystem is ~10,000 lines with a 871-line spec, and both were left almost untouched. crates/buzz-relay/src/api/git/ totals 9,858 lines; across all relay passes only mod.rs, hook.rs, policy.rs (partial) and transport.rs (partial) were read — cas_publish.rs, hydrate.rs, store.rs, pack_cache.rs, manifest.rs, manife

*Follow-up:* Verify every git subprocess spawn in desktop/src-tauri/src/commands/project_git*.rs, project_terminal.rs and crates/buzz-dev-mcp/src/shim.rs routes through the hardened env builder, and check whether shim.rs:304's PATH-resolved `git-sign-no

**[medium]** Four slices returned findings out of all proportion to their size, and none of them received a deep-dive lens. desktop-rest: 604 files, 30 read, 1 finding. desktop-agents: 322 files, 24 read, 2 findings. tauri-core: 183 files, 14 read, 3 findings — and its own note concedes managed_agents/, huddle/ (10,573 lines), mesh_llm/ (5,993), migra

*Follow-up:* Schedule depth passes for the four slices, prioritising by unexamined-lines-per-finding: tauri-core's managed_agents/ and huddle/ first (covered above), then buzz-push-gateway end to end (app_attest.rs, grant.rs, authority.rs, postgres.rs, 

**[medium]** Fifteen NIP specs carry "Security Considerations" sections that were never diffed against the implementation — and the one time this method was applied it produced three confirmed findings. docs/nips/ holds NIP-AA (Agent Authentication), AE, AM (Agent Turn Metrics), AO (Agent Observability), AP (Agent Personas), CW (Channel Window), DV, E

*Follow-up:* For each of NIP-PL, NIP-RS, NIP-IA, NIP-AA and NIP-AO, extract every MUST/MUST NOT from its Security Considerations section into a checklist and grep for the enforcing code, exactly as was done for NIP-OA. Start with NIP-PL against crates/b

**[medium]** Secret leakage through logs, telemetry and the audit chain was never checked, and the one crate that would prove SECURITY.md's tamper-evidence claim was read only in part. crates/buzz-relay/src/telemetry.rs (580 lines) and metrics.rs (207) were listed as never opened by every relay pass; grep finds no redact/skip_serializing/SecretString/

*Follow-up:* Grep every crate for `{:?}` / `#[derive(Debug)]` on types carrying SecretKey, nsec, conversation keys, bearer tokens or S3 credentials, and check each logging call site; read crates/buzz-relay/src/telemetry.rs and metrics.rs specifically fo

**[medium]** Two confirmed findings rest on files no agent read in full, so their scope and their fix are both unverified. (1) crates/buzz-relay/src/audio/handler.rs:244 (HIGH, ban gate absent from huddle-audio auth) — 1,430 lines, of which only lines ~150-300 and 1153-1215 were read, with the surrounding join/room logic in join.rs (3,036 lines) never

*Follow-up:* Before patching, read audio/handler.rs and audio/join.rs in full, req.rs lines 1338-2084 in full, and crates/buzz-pubsub/src/lib.rs in full. For the NIP-OA fix, first enumerate every call site of buzz_sdk::nip_oa::verify_auth_tag across the

**[low]** The shell/YAML surface got one breadth pass focused narrowly on GitHub Actions injection, leaving the release and update trust chain unaudited. scripts/ has 52 entries; the supply-chain pass read about five. Never opened: desktop_release.py, prepare-desktop-release.sh, verify-desktop-release-*.sh (read), publish-mobile-release-candidate.s

*Follow-up:* Read desktop/src-tauri/src/commands/updater.rs and the `plugins.updater` block of tauri.conf.json (endpoint scheme, pubkey present, dangerousInsecureTransportProtocol), then bundle-sidecars.sh, prepare-desktop-release.sh and desktop_release

**[low]** No lens swept for secret material reaching logs, crash reports, or telemetry. crates/buzz-relay/src/telemetry.rs and metrics.rs were never opened by any relay pass; desktop/src-tauri/src/commands/agent_logs.rs and the agent_discovery install_report family were never read — notably install_report_redaction_tests.rs is 480 lines, which mean

*Follow-up:* Targeted sweep: read desktop/src-tauri/src/commands/agent_discovery/install_report.rs and install_capture.rs against their redaction tests, read crates/buzz-relay/src/telemetry.rs, and grep the whole workspace for `Debug` derives on config/

**[low]** desktop/src/testing/e2eBridge.ts is 12,213 lines and was never read; the desktop-rest auditor only confirmed it is guarded by `import.meta.env.DEV`/`MODE==='e2e'` plus a `window.__BUZZ_E2E__` flag. Nobody checked the Vite build config to confirm the module is actually tree-shaken out of production bundles, nor enumerated what the bridge e

*Follow-up:* Check desktop/vite.config.* for the `define`/`import.meta.env.MODE` handling and confirm by grepping a production build output for a distinctive e2eBridge symbol. If it survives, enumerate the bridge's exported command surface — particularl

**[low]** Nothing verified that any finding actually reproduces. Every one of the 27 confirmed findings is a static read; the audit ran no build, no test suite, and no exploit. Several findings are explicitly hedged on this — the desktop kind:40003 e-tag differential says 'I did NOT run the exploit end to end, so the relay accepts it step rests on 

*Follow-up:* Write three throwaway reproductions before the advisory ships: (1) publish a two-e-tag kind:40003 against a local relay and confirm ingest.rs accepts it, then confirm desktop and mobile render the forged edit; (2) POST a crafted GIF (1x1 lo


---

## What was never in scope

531 of 3,435 tracked files, deliberately: `desktop/tests` (149) and `mobile/test`
(97), which were read by the critics as evidence of the project's own threat model
but not audited for vulnerabilities; `desktop/src-tauri` non-source (74: icons,
resources); `benchmarks/` (40); `docs/` (41); `examples/` (10); assets (15);
agent-config files.

Additionally, and not by design: **no Kotlin or Swift auditor was ever assigned.**
~2,100 lines of native mobile code were never opened by any pass. **No secret
scanning ran** anywhere — there is no gitleaks/trufflehog step in this audit or in
the project's CI. **No fuzzing exists or was run**: there is no `fuzz/` directory
or `cargo-fuzz` target in the workspace. The project's own adversarial conformance
suites (`crates/buzz-test-client/tests/`, including 23 `#[ignore]`d cases) were
never run or read. 2,161 lines of formal specification in `docs/formal/` — the
project's strongest statement of its own security properties — were never opened.

---

## Cost, caps, and what they cut

| | |
|---|---|
| Agents run | 44 sweep + 39 verification + 6 canary + 1 backtest + 2 planting = **92** |
| Agent errors | 0 |
| Subagent tokens | ~10.1M across the workflows |
| Hard cap | 800,000 output tokens — **not reached** |
| What the caps cut | Verification capacity of 48 findings meant **137 findings were never verified**. This was a triage decision, not a budget stop. |
| What failure cut | **Gate B**: 0 of 27 findings received cross-model verification. |

---

## If you act on one thing

Fix the **F014/F015 parser differential** — desktop and mobile both resolve an
edit's target by the last `e` tag while the relay uses a different rule — because
it is the one confirmed finding where two independent implementations and a server
disagree about the meaning of the same event, and disagreement about *which event
an edit applies to* is an authorship-integrity problem rather than a crash.

Then look at `desktop/src-tauri/src/managed_agents/`. Not because we found
something there — **because we found nothing there, and we now know that means
nothing.** It is ~37,000 lines, it holds the repository's `unsafe` code, it has no
lint coverage, no semgrep rules that apply, and no agent read it properly. It is
the largest unlit area in this report.
