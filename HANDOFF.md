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
(`desktop/src-tauri/src/commands/dms.rs:17-45`). `kind:1059` appears only in
desktop test files. A warning callout now states plainly that DM confidentiality
rests on relay-side authorization, not cryptography.

**Local only, NOT in any git repo** — `C:\Users\simon\Downloads\buzz_me\buzz-blindspots.md`
(30 KB). A blindspot pass on the technical creation of Buzz: false framings, stack
map, 12 blindspots each with a research prompt, 5-prompt minimum set, rat-hole
warning, master prompt. Four claims marked `[verified]` were re-checked directly
against the repo. Deliberately unpublished — it reads as a critique of someone
else's shipped codebase. **This file exists in exactly one place; back it up
before touching `buzz_me/`.**

## Known loss — four docs need recreating if wanted

Earlier in the session, four documentation files were written into the upstream
clone at `buzz_me/buzz/docs/`. They were never committed (untracked in someone
else's repo), the clone was replaced, and **they are gone**:

- `docs/index.md` — navigation hub grouping README / ARCHITECTURE / CONTRIBUTING /
  NIPs / formal specs by audience (end user / contributor / operator / protocol
  implementer)
- `docs/key-concepts.md` — glossary; entries for Nostr, NIP, relay, community,
  channel, kind ranges, NIP-42, NIP-98, membership, audit log, canvas, huddle,
  workflow, Blossom, ACP, managed agent, persona, persona pack, buzz-cli,
  buzz-dev-mcp, git events
- `docs/troubleshooting/common-issues.md` — symptom → cause → fix, mined from
  TESTING.md, AGENTS.md, CONTRIBUTING.md, and readiness code
- `docs/user-guide/using-your-ai-subscription.md` — how to run Buzz agents on a
  Claude Pro/Max or ChatGPT Plus subscription instead of a metered API key

Their key finding is preserved here so it need not be re-derived: **Buzz Desktop's
Claude Code and Codex agent types do support subscription auth** — they shell out
to the real CLI and gate readiness on `claude auth status` / `codex login status`,
never on `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (`discovery.rs:140` and
`discovery.rs:173`). The onboarding UI prefers subscription login
(`SetupStep.tsx:397-442`). By contrast the built-in **Buzz Agent** runtime calls
LLM APIs directly and accepts only metered credentials
(`crates/buzz-agent/src/config.rs:755-802`). Standalone `buzz-acp` without Desktop
is API-key-only in practice; Codex's ChatGPT login fails with HTTP 426 headless.

If recreating: write them into a fork you control, or commit immediately —
untracked files in the upstream clone do not survive.

## Next task

**Pick one; nothing is blocked.**

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
3. **Recreate the four lost docs** (above) if they're still wanted.

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
