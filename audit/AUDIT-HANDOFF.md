# HANDOFF — buzz audit: COMPLETE

Last updated: 2026-08-01. **The audit is finished. The deliverable is
`buzz-audit-advisory.md` in this folder.**

## What exists now

| File | What |
|---|---|
| **`buzz-audit-advisory.md`** | **The deliverable.** 27 confirmed findings, 21 refuted, 137 unverified-but-listed, 49 coverage gaps, and the calibration numbers |
| `audit-phase0-log.md` | Raw Phase 0 record: tooling, graphify, the slice list, plus two corrections made mid-run |
| `AUDIT-PLAN.md` | The original spec (historical — the run deviated from it where Phase 0 said to) |
| `graphify-out/` | Knowledge graph: `graph.json`, `graph.html`, `GRAPH_REPORT.md` |

Scratchpad (session-scoped path, but the files are still there):
`C:/Users/simon/AppData/Local/Temp/claude/C--Users-simon-Downloads-buzz-me/246c14bd-8634-4529-b69c-47258b3a4d50/scratchpad/`
— `confirmed.json`, `refuted.json`, `triage-dropped.json`, `gaps.json`,
`coverage.json`, `canary-score.json`, `backtest-result.json`, `raw-findings.json`,
plus `gate_a.py`, `gate_b.py`, `tool_index.py`, `score_canary.py`,
`make_advisory.py` and the four `wf-*.js` workflows. Regenerate the advisory with
`python make_advisory.py`.

## Headline results

- **27 confirmed findings: 4 high, 12 medium, 11 low. No critical survived.**
- **199 raw findings → 1 hallucination (0.5%)** caught by Gate A.
- **Reporters claimed 1 critical + 20 high among the survivors; verifiers rescored
  them to 0 critical + 4 high.** Severity inflation in the discovery phase is the
  single biggest reason not to trust an unverified LLM audit.
- **48 verified → 27 survived (56%).** 11 of those survived only 2-of-3.
- **Canary recall 4/10** (easy 2/3, medium 0/4, hard 2/3).
- **Backtest: passed.** Blind on pre-fix code, the depth agent found the real TLS
  downgrade at `relay_provider.dart:21`, exact line and mechanism.

## Two things that failed, both stated in the advisory

1. **Gate B never ran.** The Codex CLI authenticated and passed two smoke tests,
   then the account hit its usage limit ("try again at Aug 7th") and all 9
   batches returned empty. Every finding is **Claude-verified only** and the
   correlated-error caveat applies in full. **If you want Gate B, rerun
   `python gate_b.py confirmed.json 27` after Aug 7** — the script works; it was
   quota, not code. (It was also patched mid-run for two Windows issues: the npm
   shim is `codex.CMD`, and prompts now go via stdin.)
2. **`cargo clippy` could not analyse `desktop/src-tauri`.** Root `Cargo.toml:32`
   excludes it and it is its own workspace, so the original "workspace is
   clippy-clean" claim did not cover 354 Rust files — including every `unsafe`
   block. The build fails on a missing prebuilt `buzz-acp` sidecar and a missing
   CMake toolchain; `cargo check` fails the same way. `cargo audit` did work there.

## If someone picks this up

The advisory's own recommendation: fix the **F014/F015 parser differential**
(desktop and mobile both resolve a kind:40003 edit's target by the *last* `e` tag
while the relay uses a different rule), then look hard at
`desktop/src-tauri/src/managed_agents/` — ~37,000 lines, holds the repo's `unsafe`
code, no lint coverage, no applicable semgrep rules, and no agent read it
properly. We found nothing there and that means nothing.

The biggest *methodological* gap: **no lens looked for indirect prompt injection
or agent confused-deputy**, which is the vulnerability class most specific to a
Nostr client that runs managed coding agents. That would be the obvious second
audit.

## Do not

- Write into `buzz/` — read-only upstream clone at `b1b283cd4`, untouched.
- Ship patches from this. Advisory only.
- Quote the reporters' severity labels. Use the verifier-corrected ones.

## Harness notes worth remembering

- `Agent`-tool subagents went idle without returning results four times
  (`backtest`, `backtest2`, and the first canary planter stalled with zero edits).
  Re-running the identical prompt through a one-agent **Workflow** returned
  structured output immediately. Prefer Workflow when you need the result.
- A long-lived subagent left alive will act on stale context: the graphify agent
  re-ran all of Phase 0 unprompted and started a **duplicate Gate B** against the
  same output file. Stop subagents when their task is done.
- Workflow `args` arrives stringified — embed data in the script instead.
