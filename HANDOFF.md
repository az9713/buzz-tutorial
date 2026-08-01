# HANDOFF — resume point for buzz-tutorial

**Read this first each new session.** This file is the live "what to do next."
There is no `CLAUDE.md` in this repo; the standing conventions live in
`README.md` and in "How to work" at the bottom of this file.

Work spans two locations:
- **This repo** — `C:\Users\simon\Downloads\buzz_me\buzz-tutorial` → published at
  https://github.com/az9713/buzz-tutorial (public) and served via GitHub Pages
- **Working folder** — `C:\Users\simon\Downloads\buzz_me` holds an upstream clone
  of `block/buzz` plus local-only research notes

Last session: 31 July 2026.

## Current state (as of latest push)

Commit `e14b5f0` on `main`; local and remote hashes match; working tree clean.

**Four self-contained HTML documents, all live on GitHub Pages** (Pages enabled
31 Jul 2026, `source: main /`, all four verified HTTP 200):

| Document | Live URL | Landed in |
|---|---|---|
| `what-is-nostr.html` (~93 KB, 8 SVGs) | https://az9713.github.io/buzz-tutorial/what-is-nostr.html | `1ee5c85` |
| `how-buzz-works.html` (~135 KB, 10 SVGs) | https://az9713.github.io/buzz-tutorial/how-buzz-works.html | `218464c` |
| `trust-map.html` (~41 KB, 1 SVG) | https://az9713.github.io/buzz-tutorial/trust-map.html | `857e570` |
| `hardening.html` (~25 KB) | https://az9713.github.io/buzz-tutorial/hardening.html | `e14b5f0` |

All are single pages with CSS/JS/SVG inlined, no CDN, theme-aware. Identical
copies also sit in `C:\Users\simon\Downloads\buzz_me\`. `README.md` frames all
four, states they are unofficial, CC BY 4.0.

**Also tracked:** `buzz-docs/` — four docs proposed for upstream (`index.md`,
`key-concepts.md`, `troubleshooting/common-issues.md`,
`user-guide/using-your-ai-subscription.md`), committed in `693f3fe`. Their
internal links are written relative to `buzz/docs/`, their intended home in a
fork of `block/buzz`, so they do not resolve from `buzz-docs/`. See
`buzz-docs/README.md`. **An upstream PR for these was considered and declined on
31 Jul 2026 — do not re-propose it.**

Their key finding, kept here so it need not be re-derived: **Buzz Desktop's
Claude Code and Codex agent types do support subscription auth** — they shell out
to the real CLI and gate readiness on `claude auth status` / `codex login status`,
never on `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (`discovery.rs:140`,
`discovery.rs:173`); onboarding prefers subscription login
(`SetupStep.tsx:397-442`). The built-in **Buzz Agent** runtime calls LLM APIs
directly and accepts only metered credentials (`buzz-agent/src/config.rs:763-813`).

**Local only, NOT in any git repo** — `C:\Users\simon\Downloads\buzz_me\buzz-blindspots.md`
(30 KB): blindspot pass on Buzz's technical creation — false framings, stack map,
12 blindspots each with a research prompt, rat-hole warning, master prompt.
Deliberately unpublished — it reads as a critique of someone else's shipped
codebase. Backed up byte-identical to `C:\Users\simon\mms\buzz-blindspots.md`.
Two copies, both outside git; if you edit one, re-copy.

## Trust map findings — verified 31 Jul 2026 against `main` @ `b1b283cd4`

Recorded here so a fresh session need not re-derive them. Full evidence and
prose in `trust-map.html`.

| Property | Enforced by | Verification armed? |
|---|---|---|
| Channel message content | SQL membership predicate; **plaintext at rest** | enforcement yes, DB tests mostly not |
| DM content | same predicate — DMs are ordinary channels, **no E2E crypto** | same |
| Channel membership | relay-only `kind:13534`; forged snapshots rejected | **yes** — e2e test in CI (`ci.yml:755`) |
| Tenant isolation | app predicates + composite keys + migration lint | partly; **RLS backstop absent** |
| Agent authority | scopes + filter + prose; permissions auto-approved | **no meaningful bound** |
| Media blob access | uploads: 5 gates. downloads: **SHA-256 knowledge only** | **off by default** |

The four sharpest, with citations:

- **RLS does not exist anywhere in the repo.** No `ROW LEVEL SECURITY` DDL in
  `migrations/`, no `NOBYPASSRLS`, no `set_config('app.community_id',…)`. Yet the
  non-interference proof is stated relative to axioms A-RLS-1..5 naming RLS the
  fail-closed backstop, "admitted by a startup/CI assertion suite" that also does
  not exist (`docs/multi-tenant-relay.md:350-374`, `:655-660`). A missed
  `WHERE community_id` predicate therefore fails **open**.
- **`require_media_get_auth` defaults to `false`** (`buzz-relay/src/config.rs:212-214`,
  `:742-748`, asserted `:1037-1040`). `authenticate_media_read` returns after
  tenant binding only (`api/media.rs:494-498`), `Cache-Control: public`
  (`:517-521`). Uploads pass five gates (`buzz-media/src/auth.rs:20-70`,
  `api/media.rs:171-218`).
- **ACP auto-approves every `session/request_permission`** with `allow_once`
  (`buzz-acp/src/acp.rs:1856-1900`); raw channel text is interpolated as
  `Content: {content}` with no delimiting (`buzz-acp/src/queue.rs:1097-1109`).
  `ReposRead` documented as not enforced, `ReposWrite` not enforced on git HTTP
  push (`buzz-auth/src/scope.rs:46-56`).
- **208 `#[ignore = "requires Postgres"]` tests; `scripts/run-tests.sh:93-100`
  states outright nothing runs them.** CI reaches in by name only
  (`ci.yml:687-717`). Genuinely armed: migration tenant lints
  (`buzz-db/src/migration.rs:368-507`), `buzz-conformance` replay (production
  binds `NoopTracer`, `buzz-relay/src/state.rs:799`), the NIP-43 forged-snapshot
  e2e (`buzz-test-client/tests/e2e_relay.rs:219-237`), and the per-community
  hash-chain audit log, on by default (`config.rs:853`).

Doc drift found: the TLA spec (`docs/spec/MultiTenantRelay.tla:38-40`) and design
doc (`docs/multi-tenant-relay.md:896-899`) still describe
`get_accessible_channel_ids` as unscoped, citing `channel.rs:545-560`. It now
lives at `channel.rs:746-774` with `WHERE community_id = $1` on both arms. Code
newer and safer — but the RLS gap drifts the *other* way, so "code is newer" is a
recency rule, not a safety guarantee.

## Remediation stance (decided 31 Jul 2026)

`hardening.html` is an **advisory, not a patch series**. Nothing has been
submitted upstream. The user chose advisory-only after asking why the full fix
wasn't strictly better; the reasons, so they need not be re-argued: we cannot
merge, so an unmerged patch protects nobody while a published URL reaches
operators today; two of the four gaps are deliberate product decisions whose
context we lack; we cannot verify a patch to the standard it needs (the relevant
test pool is exactly the one that doesn't run); the cost of a wrong advisory is a
correctable sentence, of a wrong merged tenant-fence migration is a leak; and the
advisory is step one of any PR route regardless.

The advisory's own ranking, if this is ever revisited: (1) prompt delimiting in
`queue.rs` — the convention already exists in-tree at
`buzz-agent/src/handoff.rs:83-89` with a regression test at
`regressions.rs:1108,1199`; (2) a startup warning for `require_media_get_auth`
mirroring `config.rs:637-641` — **do not flip the default**, that breaks clients;
(3) a config-gated ACP permission policy with today's behaviour as default,
framed as a question not a PR; (4) a CI job for the ignored Postgres tests;
(5) RLS — **advised against**, build only the assertion suite.

## Next task

**Nothing is queued and nothing is blocked.** Both tasks carried by the previous
handoff are done. Pick freely, or take one of these:

- **Fold the two headline findings back into the older docs.** Neither
  `what-is-nostr.html` nor `how-buzz-works.html` mentions the media download
  default or the absent RLS backstop, and both discuss the areas concerned.
- **Report upstream.** `block/buzz`'s `SECURITY.md` opens with "please do not
  report security vulnerabilities through public GitHub issues" — route the media
  default privately first, let maintainers say whether the rest can be public.
  `hardening.html` §"What a good upstream report would say" has the framing per
  finding.
- **Run the ignored Postgres tests locally** against a throwaway DB and report
  which fail. Needs no permission — happens entirely in the local clone — and it
  is the prerequisite for gap 4 ever being fixable.
- **Deepen one subsystem** with the master prompt at the bottom of
  `buzz-blindspots.md`.

If the user asks for something else, that takes precedence.

## Where to read things

- `README.md` (this repo) — what each document is and the provenance rules
- `trust-map.html` / `hardening.html` — the security findings and their remedies
- `C:\Users\simon\Downloads\buzz_me\buzz-blindspots.md` — research findings plus a
  master prompt for going deeper on any subsystem
- `C:\Users\simon\Downloads\buzz_me\buzz\` — full upstream clone of `block/buzz`,
  521 MB, git `main` @ `b1b283cd4`, tree clean, 0 commits ahead.
  **Do not commit into it** — it's upstream, not ours.

## Session-transient scratch

None this session. All four HTML documents were hand-written directly into the
repo with no generator scripts; the committed `.html` files are the durable
record and can be edited in place.

## How to work

- **Accuracy rule**: every architectural claim traceable to the repo, cited by
  file and line, opened directly rather than inferred. Keep "the docs say X"
  separate from "my read of why." Where a claim rests on the *absence* of code,
  label it as an inference.
- **Verify claims independently** before publishing. The original NIP-17 error
  got through because a plausible-sounding NIP mapping wasn't checked against the
  actual DM code path.
- **Line citations drift.** Re-verify against the clone before quoting anywhere
  public — `buzz-agent/src/config.rs` moved ~13 lines between two sessions.
- **External links rot.** Everything in `what-is-nostr.html` was confirmed on
  31 Jul 2026; `rust-nostr/nostr` had already become `nostrdevkit/nostr`.
- **Publishing loop**: edit → `cp <file>.html ../` → commit → push → poll
  `curl -s -o /dev/null -w '%{http_code}'` on the live URL until `200`. Pages
  takes roughly a minute.
- `/verify`, `/code-review` and `/security-review` all need a diff. The upstream
  clone has none (clean, 0 ahead), so scope them to a branch or commit range.
