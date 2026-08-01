# Buzz Security & Quality Audit — Execution Plan

**Status:** PLAN ONLY — not yet executed
**Target:** `buzz_me/buzz/` @ commit `b1b283cd4` (clean working tree, upstream code, not ours)
**Output:** advisory markdown at `buzz_me/` root (outside the clone, so it survives the clone being replaced)
**Written:** 2026-07-31

---

## 0. Why this document exists

An LLM-driven audit of someone else's codebase is only worth as much as its
method is inspectable. Anyone reading the resulting advisory should be able to
answer: what was actually read, what was merely sampled, what was verified
against ground truth, and what was never looked at at all. This document fixes
those answers *before* the run, so the advisory can't quietly overclaim
afterwards.

Two commitments follow from that:

- **Nothing is silently dropped.** Every scope reduction, cap, or truncation
  is logged during the run and reproduced in the advisory.
- **Advisory, not patches.** We do not own this repo. Findings ship as a
  remediation advisory ranked by value per unit of risk; we do not modify the
  clone.

---

## 1. The target

`buzz` is a multi-language monorepo: 3,435 tracked files, ~521 MB.

| Language | Files |
|---|---|
| TypeScript (`.ts`) | 842 |
| Rust (`.rs`) | 601 |
| TSX | 555 |
| MJS | 379 |
| Dart | 331 |

Top-level distribution (files per subsystem):

```
1576  desktop/src            79  crates/buzz-relay      24  crates/buzz-db
 354  desktop/src-tauri      54  deploy/charts          24  crates/buzz-core
 234  mobile/lib             51  web/src                23  crates/buzz-agent
 149  desktop/tests          49  desktop/public         17  crates/buzz-acp
  97  mobile/test            48  mobile/ios             17  docs/nips
                             46  mobile/android         15  crates/buzz-push-gateway
                             40  benchmarks/…           13  .github/workflows
                             30  crates/buzz-cli        12  crates/buzz-dev-mcp
                             27  crates/buzz-media
```

**The core constraint:** no single review context holds 2,700+ source files.
"Review the codebase" therefore means "review a defined set of slices, and be
explicit about the boundaries." Breadth and depth are separated into different
phases precisely so that neither can be faked by the other.

---

## 2. Budget and limits

| Control | Value |
|---|---|
| **Hard output-token cap** | **800,000** |
| Behaviour at cap | Further `agent()` calls throw; run stops and reports partial results honestly |
| Estimated total agents | ~68 |
| Estimated input tokens | 10–13M (dominated by source reading; little cache benefit, agents read disjoint files by design) |
| Estimated output tokens | 600–800k |
| Estimated share of weekly limit | ~25–45% of the all-models bar; larger relative hit to the Fable-specific bar |

Usage at planning time: 9% of weekly all-models consumed, 3% of Fable, week
resets Aug 5. The +50% weekly limits promo is active through Aug 19.

The cap is set at the top of the estimate, so a normal run never touches it.
It only bites if Phase 3 finds far more than expected — in which case a partial
audit reported plainly is the correct outcome, not a surprise bill.

---

## 3. Phase map

| Phase | What | Where | Agents | Model | Effort |
|---|---|---|---|---|---|
| 0 | Cartography: skill search, static analysis, graphify | inline (main session) | 0 | Fable 5 | medium |
| 1 | Breadth sweep — every slice, no exceptions | workflow | 14 | **Sonnet 5** | low–medium |
| 2 | Depth dives — risk-high slices, 3 lenses each | workflow | 21 | **Fable 5** | high |
| 3 | Adversarial verification — refute-by-default | workflow | ~30 | **Fable 5** | high |
| 4 | Completeness critic | workflow | 3 | **Fable 5** | high |
| 5 | Synthesis → advisory | inline | 0 | Fable 5 | — |

Phases 1 and 2 are **pipelined**, not barriered: a slice that finishes its
breadth sweep begins its depth dive while other slices are still sweeping.
Phase 3 sits behind a genuine barrier, because dedup requires seeing all
findings at once.

### Model rationale

Downgrading Phase 1 to Sonnet 5 saves roughly 20–25% of total cost at low
risk: Phase 1's misses get a second chance in Phase 2, and its false positives
die in Phase 3. Phases 2–4 stay on Fable 5 because that is where real
vulnerabilities are found and judged — and a weak verifier is *worse than no
verifier*, since it launders bad findings into a published advisory.

---

## 4. Phase 0 — Cartography (inline)

Three jobs, run in the main session before any fan-out.

### 4.1 Skill search

```
npx skills find nostr protocol security
npx skills find static analysis rust
```

Purpose: close the two gaps a general-purpose auditor genuinely cannot close by
reasoning — domain knowledge of known Nostr/relay attack patterns, and skills
that wrap real analysis tooling. Anything found and installed is recorded here
before use. If nothing relevant is found, that is recorded too.

### 4.2 Static analysis — ground truth

These compute facts rather than reasoning about them, which is the one thing no
number of agents replicates.

```bash
cargo audit                       # known CVEs in the Rust dependency tree
cargo clippy --all-targets        # Rust lints incl. correctness class
npm audit --omit=dev              # JS/TS dependency advisories (desktop/, web/)
semgrep --config auto             # cross-language taint & pattern rules
```

Tool output is **not** treated as final. It becomes *seed findings* fed into
Phase 3 alongside agent findings: the tool says "this line," and agents assess
whether it is reachable and exploitable in context. A tool hit that no agent
can show a path to is reported as "flagged by tooling, exploitability
unconfirmed" — not as a vulnerability.

### 4.3 Graphify

Run the `graphify` skill over `buzz/` to build a persistent knowledge graph,
then query it for:

1. **Real module boundaries** — so slices follow actual coupling rather than
   directory names.
2. **High-centrality nodes** — code many things depend on, where a defect has
   the widest blast radius.
3. **Cross-references** against existing `buzz-blindspots.md` and
   `trust-map.html`, so the run inherits prior knowledge instead of
   rediscovering it.

Graphify output may **overrule the provisional slice table below**, including
promoting a breadth slice to depth tier. That is its purpose. The final slice
list is logged at the start of the workflow.

> **Ordering trap being avoided:** running auditors before cartography means
> scoping from directory names. On a repo mixing Rust, TypeScript, and Dart,
> that is exactly how an entire language silently goes unreviewed.

---

## 5. The slice list (provisional — Phase 0 may revise)

### Breadth tier — all 14 slices, every one gets an agent

| # | Slice | Files | Why it's in scope |
|---|---|---|---|
| 1 | `crates/buzz-relay` | 79 | Ingest of untrusted events; the primary attack surface |
| 2 | `crates/buzz-core` | 24 | Keys, signatures, event validation primitives |
| 3 | `crates/buzz-acp` | 17 | Token handling path |
| 4 | `crates/buzz-db` | 24 | Persistence; injection and integrity surface |
| 5 | `crates/buzz-media` | 27 | Untrusted binary input (parsers = memory-safety surface) |
| 6 | `crates/buzz-push-gateway` | 15 | Outbound trust boundary, third-party push services |
| 7 | `crates/{buzz-cli,buzz-agent,buzz-test-client,buzz-dev-mcp}` | ~89 | Tooling; dev-mcp is an agent-facing surface |
| 8 | `desktop/src-tauri` | 354 | The Rust↔JS trust boundary; IPC command exposure |
| 9 | `desktop/src` — IPC / auth / state | ~400 | Privilege and session handling |
| 10 | `desktop/src` — network / relay client | ~400 | Handling of hostile relay responses |
| 11 | `desktop/src` — UI / rendering | ~776 | XSS / content-injection surface |
| 12 | `mobile/lib` | 234 | Dart — the language most likely to be silently skipped |
| 13 | `web/src` | 51 | Browser-facing surface |
| 14 | `deploy/charts` + `.github/workflows` | 67 | Supply-chain and secrets exposure |

`desktop/tests` (149) and `mobile/test` (97) are **not** audited for
vulnerabilities. They are read by Phase 4 as evidence of what the project
itself considers a threat.

### Depth tier — 7 slices × 3 lenses = 21 agents

Slices 1, 2, 3, 5+6 (combined), 8, 9, and 12.

---

## 6. Agent prompts

All finding-producing agents return **structured output** against a fixed
schema, so downstream phases process findings mechanically rather than by
re-reading prose.

### 6.1 Finding schema (Phases 1 & 2)

```json
{
  "slice": "string",
  "coverage_note": "which files were actually read vs skipped, and why",
  "findings": [{
    "file": "repo-relative path",
    "line": "integer",
    "severity": "critical | high | medium | low",
    "category": "kebab-case slug",
    "claim": "one sentence: what is wrong",
    "failure_scenario": "concrete attacker inputs/state -> concrete bad outcome",
    "evidence": "the code that supports the claim, quoted",
    "confidence": "high | medium | low"
  }]
}
```

### 6.2 Phase 1 — breadth sweep (×14, Sonnet 5)

> You are auditing ONE slice of the `buzz` codebase, a Nostr client and relay
> written in Rust, TypeScript, and Dart. You do not own this code; your job is
> to find defects, not to fix them.
>
> **Your slice:** `{slice.paths}` ({slice.file_count} files).
>
> Read broadly across the whole slice rather than deeply into one file. This is
> a coverage pass: your job is to surface *candidates*, and a later phase will
> verify them. Prefer naming a plausible issue with its evidence over staying
> silent.
>
> Look for: unvalidated input from the network or from other processes;
> authentication and authorization gaps; injection (SQL, command, path,
> template); unsafe deserialization; secrets in source or config; missing
> bounds/overflow checks in Rust; unsafe blocks; error paths that leak
> information or lose data; and any place where a hostile peer, relay, or event
> could drive behaviour the author clearly did not intend.
>
> **Report honestly on coverage.** In `coverage_note`, state which files you
> actually read and which you skipped, and why. Do not imply full coverage you
> did not achieve. Returning zero findings is an acceptable and useful result —
> do not invent findings to appear productive.
>
> Return ONLY the structured object.

### 6.3 Phase 2 — depth dives (×7 slices × 3 lenses, Fable 5, high effort)

Shared preamble:

> You are performing a DEEP audit of one slice of the `buzz` codebase (a Nostr
> client and relay in Rust/TypeScript/Dart). A shallow pass has already run;
> your job is to find what it missed. Read the slice's code thoroughly,
> including the paths it calls into. You do not own this code — produce
> findings, not patches.
>
> **Your slice:** `{slice.paths}`
> **Already-reported findings for this slice (do not simply repeat them):**
> `{phase1_findings}`

Then exactly one lens per agent:

**Lens A — hostile input**
> Assume every byte entering this slice is attacker-controlled: Nostr events
> from any relay, relay responses, media files, push payloads, IPC messages
> from a compromised renderer. For each entry point, trace what an attacker
> controls and how far it reaches. Look for parser differentials, resource
> exhaustion (unbounded allocation, unbounded loops, algorithmic complexity
> attacks), TOCTOU, and validation that is performed but then not enforced.

**Lens B — cryptography, keys, and identity**
> Focus on secret material and identity: private key generation, storage, and
> lifetime in memory; signature creation and — especially — signature
> *verification* and what happens when it fails; nonce and randomness sources;
> token issuance, scope, and expiry; session and permission checks. Look for
> verification that can be skipped, downgraded, or short-circuited, and for
> secrets that reach logs, disk, or IPC.

**Lens C — correctness**
> Find defects that are not security vulnerabilities: race conditions,
> incorrect error handling, silent failure, data loss on partial writes,
> resource leaks, off-by-one and boundary errors, incorrect state machines,
> and misuse of concurrency primitives. Rank by user-visible impact.

### 6.4 Phase 3 — adversarial verification (~30 agents, Fable 5, high effort)

Findings from Phases 1, 2, and static analysis are deduped by `file`+`line` in
plain code (not by an agent), triaged to the top ~40 by severity × confidence,
then batched **4 findings per verifier, 3 independent verifiers per batch**.

Verifier prompt:

> You are a skeptical security reviewer. Your job is to **REFUTE** the
> following claims about the `buzz` codebase. Each was produced by another
> model and may be wrong, may describe unreachable code, or may misread the
> logic entirely.
>
> `{batch_of_4_findings}`
>
> For each claim: open the cited file, read the surrounding code and the
> callers, and determine whether the described failure can actually occur.
> Check specifically whether validation happens earlier in the call chain,
> whether the code path is reachable at all in a shipped build, and whether
> the "attacker-controlled" input is in fact attacker-controlled.
>
> **Default to `refuted: true` when uncertain.** A false finding in a published
> advisory is far more damaging than a missed one. Confirming a claim requires
> you to state the concrete reachable path; if you cannot state it, refute.
>
> Return for each: `{ id, refuted: bool, reasoning, corrected_severity }`.

A finding survives only if **at least 2 of 3** verifiers decline to refute it.

Three lenses are used across the three verifiers — reachability, exploitability,
and code-reading correctness — because redundant identical skeptics find the
same objection three times.

### 6.5 Phase 4 — completeness critic (×3, Fable 5, high effort)

> You are the completeness critic for a security audit of the `buzz` codebase.
> You are not looking for bugs; you are looking for **what the audit failed to
> examine**.
>
> **Slices defined:** `{slice_list}`
> **Coverage notes returned by each auditor:** `{coverage_notes}`
> **Confirmed findings:** `{confirmed}`
> **Static analysis output:** `{tool_findings}`
> **Project's own tests:** `desktop/tests`, `mobile/test`
>
> Answer: Which slices returned suspiciously little relative to their size?
> What *class* of vulnerability did no lens look for? What does the project's
> own test suite defend against that our audit never examined — and vice versa,
> what is untested *and* unaudited? Which confirmed findings rest on a file no
> agent fully read? What did the four-language split cause us to under-cover?
>
> Return a prioritised list of coverage gaps, each with a concrete follow-up.

Whatever Phase 4 names becomes either a second round or an explicit
**"not covered"** section in the advisory. It is stated, never hidden.

---

## 7. Workflow skeleton

```js
export const meta = {
  name: 'buzz-audit',
  description: 'Breadth+depth security & quality audit of the buzz monorepo',
  phases: [
    { title: 'Breadth',  detail: '14 slices, Sonnet 5' },
    { title: 'Depth',    detail: '7 risk slices x 3 lenses, Fable 5' },
    { title: 'Verify',   detail: 'refute-by-default, 2-of-3 to survive' },
    { title: 'Critic',   detail: 'coverage gaps' },
  ],
}

const SLICES = args.slices           // from Phase 0 cartography
const RISK   = SLICES.filter(s => s.tier === 'depth')

// Phases 1+2 pipelined — no barrier between sweep and dive
const swept = await pipeline(
  SLICES,
  s => agent(breadthPrompt(s), {
        label: `sweep:${s.name}`, phase: 'Breadth',
        model: 'sonnet', effort: 'low', schema: FINDING_SCHEMA }),
  (r, s) => r && s.tier === 'depth'
    ? parallel(LENSES.map(l => () =>
        agent(depthPrompt(s, l, r), {
          label: `deep:${s.name}:${l.key}`, phase: 'Depth',
          model: 'fable', effort: 'high', schema: FINDING_SCHEMA })))
    : [r]
)

// Barrier is genuine here: dedup needs every finding at once
const all     = swept.flat().filter(Boolean).flatMap(r => r.findings)
const triaged = triage(dedupe([...all, ...args.toolFindings]))   // plain code
log(`${all.length} raw -> ${triaged.length} triaged (dropped ${all.length - triaged.length})`)

const batches = chunk(triaged, 4)
const verdicts = await parallel(batches.flatMap(b =>
  VERIFY_LENSES.map(l => () =>
    agent(refutePrompt(b, l), {
      label: `verify:${l.key}`, phase: 'Verify',
      model: 'fable', effort: 'high', schema: VERDICT_SCHEMA }))))

const confirmed = survivors(verdicts, { minVotes: 2 })   // 2-of-3

const gaps = await parallel([1,2,3].map(i => () =>
  agent(criticPrompt(confirmed, coverageNotes, i), {
    label: `critic:${i}`, phase: 'Critic',
    model: 'fable', effort: 'high', schema: GAP_SCHEMA })))

return { confirmed, gaps, triaged, dropped: all.length - triaged.length }
```

---

## 8. Deliverable

`buzz_me/buzz-audit-advisory.md`, containing:

1. **Method and limits** — this plan in summary, plus what actually ran.
2. **Confirmed findings**, ranked by value per unit of remediation risk, each
   with file/line, the reachable path, and the verifiers' reasoning.
3. **Flagged-but-unconfirmed** — tool hits and agent claims that did not
   survive refutation, listed with why, so they are not silently buried.
4. **Coverage gaps** — Phase 4's output: what was never examined.
5. **Cost and caps** — agents run, tokens spent, and anything the 800k cap cut.

No patches. No modifications to `buzz/`.

---

## 9. Explicitly out of scope

| Excluded | Reason |
|---|---|
| `ponytail-audit` | Advises what to delete — advice for code you own |
| `symphony-harness-rubric` | Scores autonomy readiness, not defects |
| `superpowers:code-reviewer` | Requires a plan to review against; none exists |
| `/code-review`, `/security-review`, `/simplify`, `/codex:adversarial-review` | Diff-based; the clone is clean, so the diff is empty |
| `steelman-redteam` | Attacks arguments, not code — correct tool for the *advisory* once written, as a separate job |

---

## 9a. How success is measured, and how false positives are caught

### The problem with Phase 3 alone

Phase 3 is LLM-checking-LLM. Three verifiers voting 2-of-3 defends against
*independent* error, but the finders and verifiers share a model family and
training distribution, so their mistakes are **correlated**. If Fable 5
misreads a Rust lifetime or a Nostr validation rule in a way that feels
natural, three Fable 5 verifiers can all misread it the same way and vote a
false finding through with high confidence. Voting does not fix correlated
hallucination. Everything below exists because of that.

### Gate A — mechanical evidence check (deterministic, zero tokens)

Every finding must carry an `evidence` field quoting the code it refers to. A
script then checks, with no model involved:

1. Does `file` exist in the repo?
2. Does the quoted `evidence` string literally appear in that file?
3. Does it appear at or near the claimed `line` (±10)?

Any finding failing these is **dropped automatically as hallucination**, before
a single verification token is spent. This catches the most common LLM failure
mode — invented file paths, invented line numbers, invented code — cheaply and
without judgement. The count of findings killed here is reported: it is the
audit's raw hallucination rate, and it belongs in the advisory.

### Gate B — cross-model verification (breaks correlated error)

The top confirmed findings are re-verified by a **different model family** via
the installed `codex` plugin (`codex:codex-rescue`), which routes to GPT-5
rather than Claude. A finding confirmed by Claude *and* independently confirmed
by a non-Claude model is meaningfully stronger evidence than three Claude votes,
because the two models fail differently.

Disagreements are not resolved by majority. They are **reported as
disagreements**, with both arguments, in the advisory's flagged-but-unconfirmed
section.

### Gate C — proof obligation for critical/high

No finding ships at critical or high severity on reasoning alone. Each must
carry at least one of:

- a **concrete input** (a malformed event, a crafted media file, a specific IPC
  payload) plus the traced code path from entry point to failure, cited by
  file:line at each hop; or
- a **failing test** written against the existing suite that demonstrates the
  defect; or
- **corroboration from static analysis** — the same line flagged independently
  by `cargo clippy`, `semgrep`, or `cargo audit`.

Findings that cannot meet this are demoted to medium and labelled "reasoned,
not demonstrated." That label appears in the advisory.

### Calibration — measuring recall, not just precision

Gates A–C measure *precision* (are the findings real). They say nothing about
*recall* (what did we miss). Two cheap calibrations address that:

**Planted-bug canary.** Before the run, N=10 synthetic defects of known type
and location are planted in a scratch copy of the repo — never in `buzz/`
itself. Phase 1 sweeps the copy. The fraction caught is a direct, honest recall
estimate for the breadth pass. If the sweep catches 3 of 10, the advisory says
so, and "no findings in slice X" is then correctly read as weak evidence rather
than an all-clear.

**Historical backtest (optional, costs one extra depth agent).** Pick a
security-relevant fix from `buzz`'s git history, check out its parent commit,
and run one depth agent against that slice blind. Did it rediscover the real,
already-known bug? This is the only test in the whole plan with a verified
ground-truth answer.

### Success criteria

Success is explicitly **not** "number of findings." A run that returns three
demonstrated defects and an honest coverage map is a success; a run returning
forty plausible-sounding items is a failure regardless of how many are real.

| Criterion | Target | How measured |
|---|---|---|
| Hallucination rate | < 15% of raw findings | Gate A drop count |
| Precision of shipped findings | Every critical/high meets Gate C | Proof obligation audit |
| Cross-model agreement | Reported, not targeted | Gate B confirm/dispute counts |
| Recall of breadth pass | Reported honestly, whatever it is | Planted-bug canary (n=10) |
| Coverage honesty | 100% of slices report read-vs-skipped | Phase 1/2 `coverage_note` fields |
| Actionability | Every shipped finding names a fix | Advisory review |

Every one of these numbers goes in the advisory, including the unflattering
ones. An audit that hides its own error rate is not an audit.

---

## 10. Known weaknesses of this plan

Stated up front so the advisory can be read with them in mind.

1. **Depth is sampled, not exhaustive.** 21 depth agents over 7 slices cannot
   read every line of 2,700 source files. The advisory will say which files
   were read.
2. **Phase 3 count scales with findings.** If Phases 1–2 return far more than
   ~40 triaged findings, the 800k cap becomes the binding constraint and the
   run stops mid-verification. That outcome is reported, not smoothed over.
3. **Refute-by-default trades recall for precision.** Real findings will be
   killed by cautious verifiers. This is a deliberate choice: publishing a
   wrong finding about someone else's project is worse than missing one.
4. **`desktop/src` slicing is heuristic.** 1,576 files split three ways by
   function; the boundaries come from graphify but are not guaranteed clean.
5. **Static analysis coverage is uneven** across Rust, TypeScript, and Dart —
   Dart has the weakest tooling here, and `mobile/lib` (234 files) leans most
   heavily on agent reading alone.
6. **Recall is estimated, not known.** The planted-bug canary (§9a) measures
   how well the breadth pass finds *synthetic* defects, which are easier than
   real ones. The true recall against real vulnerabilities is unknown and
   unknowable from inside this process — treat the canary number as an upper
   bound, not a measurement.
7. **Gate B depends on the Codex CLI being available.** If it is not,
   cross-model verification is skipped and every finding is Claude-verified
   only. That fact is then stated in the advisory, and the correlated-error
   caveat applies in full.
