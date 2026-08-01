# HANDOFF — resume point for buzz-tutorial

**Read this first each new session.** This file is the live "what to do next."
There is no `CLAUDE.md` in this repo; conventions are in `README.md`.

Work spans two locations:
- **This repo** — `C:\Users\simon\Downloads\buzz_me\buzz-tutorial` → published at
  https://github.com/az9713/buzz-tutorial (public)
- **Working folder** — `C:\Users\simon\Downloads\buzz_me` holds an upstream clone
  of `block/buzz` plus local-only research notes

Last session: 30–31 July 2026.

## Current state (as of latest push)

**Published and live** — commit `1ee5c85` on `main`, matches remote, tree clean:
- `what-is-nostr.html` (~93 KB) — Nostr from zero, then how Buzz uses it, then
  verified external pointers. 8 inline SVG figures.
- `how-buzz-works.html` (~135 KB) — the architecture reasoning; 9 sections built
  around "if I were building Buzz from scratch, what order would I think in."
  10 inline SVG figures. Landed in `218464c`.
- `README.md` — frames both docs, states they're unofficial, CC BY 4.0.

Both HTML files are self-contained: inlined CSS/JS/SVG, no CDN, theme-aware.
Identical copies also sit in `C:\Users\simon\Downloads\buzz_me\`.

**Correction already shipped** (`1ee5c85`): the NIP-17 row in `what-is-nostr.html`
implied Buzz's own DMs are gift-wrapped/end-to-end encrypted. They are not.
`open_dm` publishes `kind:41010`, the relay allocates a channel, and DM messages
are ordinary `kind:9` events with an `#h` tag
(`desktop/src-tauri/src/commands/dms.rs:17-45`). A warning callout now states
plainly that DM confidentiality rests on relay-side authorization, not
cryptography.

Precise wording matters here: `kind:1059` gift wrap **is** real production code
in the relay — push routing, storage, migrations — and `NOSTR.md` documents it as
a relay feature for third-party Nostr clients. What's absent is any use of it in
the Desktop app's own DM-building path, where it appears only in a test file and
the e2e bridge. "Gift wrap only exists in test files" is too strong; "the Buzz
Desktop DM path doesn't use gift wrap" is correct.

**Local only, NOT in any git repo** — `C:\Users\simon\Downloads\buzz_me\buzz-blindspots.md`
(30 KB). A blindspot pass on the technical creation of Buzz: false framings, stack
map, 12 blindspots each with a research prompt, 5-prompt minimum set, rat-hole
warning, master prompt. Four claims marked `[verified]` were re-checked directly
against the repo. Deliberately unpublished — it reads as a critique of someone
else's shipped codebase. Backed up byte-identical to
`C:\Users\simon\mms\buzz-blindspots.md` on 31 Jul 2026 — two copies exist, both
outside git. If you edit one, re-copy.

## Proposed upstream docs — `buzz-docs/` (restored, tracked)

Four docs were originally written into the upstream clone at `buzz_me/buzz/docs/`,
left untracked, and destroyed when the clone was replaced. They have been
regenerated and are now committed here in `buzz-docs/` (commit `693f3fe`):

- `buzz-docs/index.md` — navigation hub, 13 links grouped by audience (end user /
  contributor / operator / protocol implementer / vision); all paths verified
- `buzz-docs/key-concepts.md` — glossary: Nostr, NIP, relay, community, channel,
  kind ranges, NIP-42, NIP-98, membership, audit log, canvas, huddle, workflow,
  Blossom, ACP, managed agent, persona, persona pack, buzz-cli, buzz-dev-mcp, git
  events — plus the DM-encryption correction described above
- `buzz-docs/troubleshooting/common-issues.md` — symptom → cause → fix across
  setup/build, relay/CLI, ACP agents, Desktop managed agents, plus a
  "documentation trap" section recording the two ARCHITECTURE.md drifts
- `buzz-docs/user-guide/using-your-ai-subscription.md` — running Buzz agents on a
  Claude Pro/Max or ChatGPT Plus subscription instead of a metered API key

Links inside them are written relative to `buzz/docs/`, their intended home in a
fork of `block/buzz` — they will not resolve from `buzz-docs/`. See
`buzz-docs/README.md`.

Their key finding, kept here so it need not be re-derived: **Buzz Desktop's
Claude Code and Codex agent types do support subscription auth** — they shell out
to the real CLI and gate readiness on `claude auth status` / `codex login status`,
never on `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (`discovery.rs:140` and
`discovery.rs:173`). The onboarding UI prefers subscription login
(`SetupStep.tsx:397-442`). By contrast the built-in **Buzz Agent** runtime calls
LLM APIs directly and accepts only metered credentials
(`crates/buzz-agent/src/config.rs:763-813`). Standalone `buzz-acp` without Desktop
is API-key-only in practice; Codex's ChatGPT login fails with HTTP 426 headless.

**Line citations drift.** On the 31 Jul regeneration, `buzz-agent/src/config.rs`
had moved ~13 lines and `readiness.rs`'s docstring to `393-394`; `discovery.rs`
and `SetupStep.tsx` were unchanged. Re-verify line numbers against the current
clone before quoting them anywhere public.

## Next task

**Two open tasks, both decided on 31 Jul 2026. Nothing is blocked.**

1. **Enable GitHub Pages** so the HTML renders instead of showing source:
   `gh api -X POST repos/az9713/buzz-tutorial/pages -f source[branch]=main -f source[path]=/`
   Then add the two live URLs to `README.md`. ~5 minutes. This was offered and
   never actioned.
2. **Run the trust map** — the highest-value follow-up, the "Next best prompt" at
   the bottom of `buzz-blindspots.md`. For each of channel message content, DM
   content, channel membership, tenant isolation, agent authority, and media blob
   access: name the mechanism that enforces it, the artifact that verifies it, and
   whether that verification is armed in production. Four of the six have
   surprising answers.
**Dropped** — an upstream PR to `block/buzz` with the four `buzz-docs/` files was
considered and declined on 31 Jul 2026. Don't re-propose it. The docs stay here.

## Where to read things

- `README.md` (this repo) — what each document is and the provenance rules
- `C:\Users\simon\Downloads\buzz_me\buzz-blindspots.md` — the research findings,
  with a master prompt for going deeper on any subsystem
- `C:\Users\simon\Downloads\buzz_me\buzz\` — full upstream clone of `block/buzz`,
  521 MB, 3,435 files, git `main` @ `b1b283cd4`, tree clean, 0 commits ahead.
  **Do not commit into it** — it's upstream, not ours.

## How to work

- **Accuracy rule for these docs**: every architectural claim traceable to the
  repo, cited by file and line. Keep "the docs say X" separate from "my read of
  why." `ARCHITECTURE.md` has drifted from the code in at least two places (rate
  limiting, `MAX_FRAME_BYTES`) — when they disagree, the code is newer.
- **Verify claims independently** before publishing. The NIP-17 error above got
  through because a plausible-sounding NIP mapping wasn't checked against the
  actual DM code path.
- **External links rot.** Everything in `what-is-nostr.html` was fetched and
  confirmed on 31 July 2026; `rust-nostr/nostr` had already been renamed to
  `nostrdevkit/nostr`. Re-verify before any future publish.
- `/verify`, `/code-review`, and `/security-review` all need a diff. The upstream
  clone has none (0 commits ahead, clean tree), so they have nothing to operate
  on there. Scope them to a branch or a commit range.
