# buzz security & quality audit — artifacts

Multi-agent audit of the [buzz](https://github.com/buzz-chat/buzz) codebase at
commit `b1b283cd4`. Advisory only — no patches were shipped upstream.

**Result: 27 confirmed findings (4 high, 12 medium, 11 low). No critical survived
verification.** Every finding is Claude-verified only; the independent
second-model gate (Gate B) never ran, so the correlated-error caveat applies in
full. Details in the advisory.

| File | What |
|---|---|
| [`buzz-audit-advisory.md`](buzz-audit-advisory.md) | **The deliverable.** Confirmed findings ranked by value per unit of remediation risk, plus refuted/triaged lists, coverage gaps, and calibration numbers. Also as a [live web page](https://az9713.github.io/buzz-tutorial/audit/advisory.html) |
| [`managed-agents-deep-dive.md`](managed-agents-deep-dive.md) | **Follow-up audit, 1 Aug 2026.** Covers `desktop/src-tauri/src/managed_agents/` — 77 Rust files the main run never read, excluded from the cargo workspace so clippy has never analysed them. 12 findings (3 high, 4 medium, 5 low) across a prompt-injection/confused-deputy lens and an unsafe/process-control lens. Reads ~45% of the directory's `unsafe` blocks. Also as a [live web page](https://az9713.github.io/buzz-tutorial/audit/managed-agents.html) |
| [`AUDIT-PLAN.md`](AUDIT-PLAN.md) | Original spec (historical — the run deviated where Phase 0 said to) |
| [`audit-phase0-log.md`](audit-phase0-log.md) | Phase 0 record: tooling, graph build, slice list, two mid-run corrections. Also as a [live web page](https://az9713.github.io/buzz-tutorial/audit/phase0-log.html) |
| [`AUDIT-HANDOFF.md`](AUDIT-HANDOFF.md) | Session handoff: headline results, what failed, harness notes |
| [`buzz-blindspots.md`](buzz-blindspots.md) | Blindspot pass on the codebase. Also as a [live web page](https://az9713.github.io/buzz-tutorial/audit/blindspots.html) |
| `data/` | Raw evidence: findings at every stage, verifier votes, tool output (semgrep, clippy, cargo-audit), canary/backtest scores, and the scripts and workflows that produced them |
| `graph/` | Knowledge graph: [`GRAPH_REPORT.md`](graph/GRAPH_REPORT.md) and an interactive [`graph.html`](https://az9713.github.io/buzz-tutorial/audit/graph/graph.html) (live, self-contained) |

## Regenerating the advisory

`python data/make_advisory.py` rebuilds `buzz-audit-advisory.md` from the JSON in
`data/`, and `python data/md2html.py` re-renders all four HTML pages
(`advisory.html`, `blindspots.html`, `managed-agents.html`, `phase0-log.html`)
from their markdown —
it borrows the site's stylesheet from `hardening.html`, so re-run it if that
theme changes.

## Not included

`graphify-out/graph.json` (26 MB) and the `.graphify_*.json` intermediates plus
the 614-file analysis cache (~97 MB total) — all derived, all regenerable from
the source clone.
