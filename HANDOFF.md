# HANDOFF — resume point for buzz-tutorial

**Read this first each new session.** This file is the live "what to do next."
There is no `CLAUDE.md` in this repo; the standing conventions live in
`README.md` and in "How to work" at the bottom of this file.

Work spans two locations (paths are relative to the local working folder, which
this file deliberately does not name — it is a public repo):
- **This repo** — `<working folder>/buzz-tutorial` → published at
  https://github.com/az9713/buzz-tutorial (public) and served via GitHub Pages
- **Working folder** — `<working folder>` holds an upstream clone
  of `block/buzz` plus local-only research notes

Last session: 1 August 2026 (second session that day — the onboarding page).

## Current state (as of latest push)

Commit `e892b76` on `main`; local and remote hashes match; working tree clean.

**Eight self-contained HTML documents, all live on GitHub Pages** (Pages enabled
31 Jul 2026, `source: main /`, every URL below verified HTTP 200 on 1 Aug 2026):

| Document | Live URL | Landed in |
|---|---|---|
| `what-is-nostr.html` (~93 KB, 8 SVGs) | https://az9713.github.io/buzz-tutorial/what-is-nostr.html | `1ee5c85` |
| `how-buzz-works.html` (~135 KB, 10 SVGs) | https://az9713.github.io/buzz-tutorial/how-buzz-works.html | `218464c` |
| `trust-map.html` (~41 KB, 1 SVG) | https://az9713.github.io/buzz-tutorial/trust-map.html | `857e570` |
| `hardening.html` (~25 KB) | https://az9713.github.io/buzz-tutorial/hardening.html | `e14b5f0` |
| `buzz-onboarding.html` (~55 KB) | https://az9713.github.io/buzz-tutorial/buzz-onboarding.html | `190959f`, `e892b76` |
| `audit/advisory.html` (~190 KB) | https://az9713.github.io/buzz-tutorial/audit/advisory.html | `a16a705` |
| `audit/blindspots.html` (~45 KB) | https://az9713.github.io/buzz-tutorial/audit/blindspots.html | `3ee8ec8` |
| `audit/phase0-log.html` (~29 KB) | https://az9713.github.io/buzz-tutorial/audit/phase0-log.html | `3ee8ec8` |

**`buzz-onboarding.html` is new (1 Aug 2026)** and is the first *user-facing*
document here — the other four explain how Buzz works; this one explains how to
operate it. Covers every item in the desktop app's main sidebar and settings
sidebar at **v0.5.3** (which matches the clone at `b1b283cd4` — `desktop/package.json`
says `"version": "0.5.3"`, verified, so no drift). Click paths, labels, the
Personal/Communities/App settings grouping, all 25 keyboard shortcuts and the full
workflow schema are quoted from source with file:line beneath each claim.

Its centre is a **workflow cookbook**: eight YAML recipes that paste into the
create-workflow dialog's `Edit as YAML` mode (`WorkflowFormBuilder.tsx:215`),
covering all five triggers and all seven actions from
`crates/buzz-workflow/src/schema.rs`, plus six validator traps. Facts worth not
re-deriving: template vars are dotted (`{{trigger.text}}`) but expression vars are
flat (`trigger_text`) because evalexpr can't parse dots; `interval` has a 60s
floor; a `send_message` `channel:` override must be a UUID *and* equal the
workflow's own channel (`executor.rs:468`); `call_webhook` needs owner/admin, not
membership (SEC-006, `schema.rs:149-161`).

`e892b76` made the page interactive — copy buttons on all 10 code blocks,
scroll-spy TOC, self-linking headings, back-to-top — and linked it from
`README.md`. **Verified in Chrome over a local server: 35/35 TOC links resolve, 0
broken anchors, scroll-spy observed working.** The clipboard write itself is
*unverified* — Chrome's permission prompt on a non-HTTPS localhost origin froze
CDP mid-test. Standard `navigator.clipboard.writeText` with an `execCommand`
fallback; Pages serves HTTPS. **Click a Copy button on the live page once to close
this out.**

Plus the interactive knowledge graph at
https://az9713.github.io/buzz-tutorial/audit/graph/graph.html.

**The multi-agent audit landed here on 1 Aug 2026** (`afec11f`), in `audit/`:
the advisory (27 confirmed findings — 4 high, 12 medium, 11 low, no critical
survived), the full evidence chain in `audit/data/`, and the knowledge graph.
See `audit/README.md`. The 97 MB of derived graphify cache was deliberately
left out as regenerable. **Every finding is Claude-verified only** — Gate B, the
independent second-model cross-check, never ran (quota); the correlated-error
caveat applies in full.

`d1d3c37` stripped absolute local filesystem paths (they carried the local
username) out of every published artifact and out of the helper scripts, which
now resolve paths relative to themselves. Verified 0 username references on the
live pages. **Don't reintroduce absolute paths into anything under this repo.**

All are single pages with CSS/JS/SVG inlined, no CDN, theme-aware. Identical
copies of the original four also sit in the working folder. `README.md` frames
all five explainers, states they are unofficial, CC BY 4.0.

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

**Now published** — `audit/buzz-blindspots.md` (30 KB): blindspot pass on Buzz's
technical creation — false framings, stack map, 12 blindspots each with a research
prompt, rat-hole warning, master prompt. **This reversed an earlier decision.**
Through 31 Jul 2026 it was deliberately kept out of git because it reads as a
critique of someone else's shipped codebase; on 1 Aug 2026 it was committed here
with the rest of the audit artifacts and rendered to
`audit/blindspots.html`. A local backup remains in the MMS store outside git.

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

**Two decisions are open and need the user, not more work:**

1. **Gate B is runnable again after 7 Aug 2026.** `python audit/data/gate_b.py
   audit/data/confirmed.json 27` re-verifies the 27 confirmed findings with a
   non-Claude model. The script is correct — it failed on Codex quota, not code
   (it was patched mid-run for two Windows issues: the npm shim is `codex.CMD`,
   and prompts go via stdin). It now takes a `BUZZ_CLONE` env override. Until it
   runs, the advisory's confidence claims stay capped.
2. **`audit/buzz-blindspots.md` is public, reversing an earlier decision.**
   Through 31 Jul 2026 it was deliberately kept out of git because it reads as a
   critique of someone else's shipped codebase; the 1 Aug "commit all audit
   artifacts" instruction overrode that. Flagged to the user 1 Aug; no answer
   yet. Unpublishing now requires a history rewrite and force-push.

Then, unblocked work in rough priority:

- **START HERE — the Agents deep-dive companion page.** Agreed with the user on
  1 Aug 2026 as the next document, explicitly deferred to a fresh session because
  it needs a reading pass over ~40,000 lines and the previous session was past
  173k context. Goal: give **Agents** the reference treatment that
  `buzz-onboarding.html` gave **Workflows**. The onboarding page covers Agents at
  orientation depth only (three-layer concept, the 12-harness table, five click
  paths); it is roughly one screen out of a needed fifteen.

  Scope: `desktop/src/features/agents/` (**202 files, 39,877 lines**, 181 in
  `ui/`), `desktop/src/features/agent-memory/`, plus crates `buzz-agent`,
  `buzz-acp`, `buzz-persona`. The ten proposed sections, inferred from component
  names and **not yet confirmed by reading**: (1) the config surface field by
  field — `AgentConfigFields`, `ProviderConfigFields`, `ModelPicker`,
  `EditAgentAdvancedFields`, `AgentAiConfigurationMode`, and the
  defaults-vs-per-agent precedence; (2) **MCP servers** (`McpServersSection.tsx`)
  — likely the highest-leverage undocumented feature in the app; (3) env and
  secrets (`EnvVarsEditor`, `PersonaProviderApiKeyField`) — including *what leaks
  when a persona is shared*, a security question not a convenience one;
  (4) personas as a system (catalog, share, recipients, delete, prompt sections);
  (5) teams; (6) snapshots — what actually travels between machines;
  (7) reading a session (`ManagedAgentSessionPanel`,
  `AgentSessionTranscriptList`, `FileEditDiffView`, `RawEventRail`,
  `ManagedAgentLogPanel`) — the debugging chapter; (8) **BYOH / ACP** — what a CLI
  must implement to plug in, the genuinely novel capability with nothing written
  about it; (9) run location (`AgentRunLocationContext`) and its interaction with
  the Compute setting; (10) agent memory. Plus worked examples in the cookbook
  spirit: triage agent, repo-bound reviewer, a three-model team, an MCP-equipped
  agent.

  **Two scoping questions were put to the user and are unanswered:**
  (a) full ten-section reference, or just sections 1, 2, 3 and 7 — config, MCP,
  secrets, debugging — for roughly a third of the effort? (b) drive the *running*
  Buzz app (the user has it open with four agents: Claude, Codex, Grok, hermes)
  to screenshot real dialogs and session panels, which would also catch anywhere
  the source misled us? Ask before starting; both change the shape of the work.

  **Honest limit to state in the document itself:** the config *surface* is
  readable TypeScript and can be documented accurately, but runtime behaviour
  (timeouts, failure surfacing, mid-run panel state) cannot be verified without
  running the app — and this documents the interface to `managed_agents/`, ~37,000
  Rust lines with no lint coverage that nobody has properly reviewed.

- **Fix the F014/F015 parser differential** — the advisory's own top
  recommendation. Desktop and mobile both resolve a `kind:40003` edit's target by
  the *last* `e` tag while the relay uses the *first*; fixing one platform alone
  leaves the differential. Details in `audit/advisory.html`.
- **A second audit for indirect prompt injection / agent confused-deputy.** No
  lens in the first audit looked for it, and it is the vulnerability class most
  specific to a Nostr client that runs managed coding agents.
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
- `audit/README.md` — the audit: what each artifact is and how to regenerate it
- `audit/buzz-audit-advisory.md` — the 27 confirmed findings, ranked by value per
  unit of remediation risk, with the coverage gaps and calibration numbers
- `audit/buzz-blindspots.md` — research findings plus a
  master prompt for going deeper on any subsystem
- `<working folder>/buzz/` — full upstream clone of `block/buzz`,
  521 MB, git `main` @ `b1b283cd4`, tree clean, 0 commits ahead.
  **Do not commit into it** — it's upstream, not ours.

## Session-transient scratch

**None outstanding — the generators are committed, not transient.** The audit's
scripts were rescued out of a session-scoped scratchpad into `audit/data/` on
1 Aug 2026, so nothing load-bearing lives in a temp directory any more.

The four original explainers **and `buzz-onboarding.html`** were hand-written
directly into the repo with no generator; edit those `.html` files in place.
`buzz-onboarding.html` has no markdown source and is **not** part of the
`md2html.py` `DOCS` table — do not try to re-render it. Its inline `<script>`
(copy buttons, scroll-spy, anchors, back-to-top) is self-contained vanilla JS at
the bottom of the file. The three audit pages are the opposite — **generated**,
so edit the markdown and re-render, never the HTML:

- `python audit/data/make_advisory.py` → `audit/buzz-audit-advisory.md` (from the
  JSON in `audit/data/`, so no number is hand-copied)
- `python audit/data/md2html.py` → `audit/{advisory,blindspots,phase0-log}.html`
  (loops over a `DOCS` table; add a row for a fourth document). It lifts the
  `<style>` block out of `hardening.html` at render time so there is only one
  theme — **if that theme changes, re-run this or the audit pages drift.** Each
  render self-checks content probes, and the advisory asserts exactly 27
  severity badges.

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
