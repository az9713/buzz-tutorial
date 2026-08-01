"""Assemble buzz-audit-advisory.md from the run's JSON artifacts.

The prose is authored here; the finding tables and detail blocks are rendered from
data so no number is hand-copied.
"""

import json
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE.parent / "buzz-audit-advisory.md"

confirmed = json.loads((HERE / "confirmed.json").read_text(encoding="utf-8"))
refuted = json.loads((HERE / "refuted.json").read_text(encoding="utf-8"))
dropped = json.loads((HERE / "triage-dropped.json").read_text(encoding="utf-8"))
gaps = json.loads((HERE / "gaps.json").read_text(encoding="utf-8"))
coverage = json.loads((HERE / "coverage.json").read_text(encoding="utf-8"))
canary = json.loads((HERE / "canary-score.json").read_text(encoding="utf-8"))
raw = json.loads((HERE / "raw-findings.json").read_text(encoding="utf-8"))["findings"]

SEV = {"critical": 4, "high": 3, "medium": 2, "low": 1}
sev_conf = Counter(f["final_severity"] for f in confirmed)
sev_claim = Counter(f["severity"] for f in confirmed)
sev_raw = Counter(f["severity"] for f in raw)
split = [f for f in confirmed if f["keep_votes"] == 2]


def detail(f):
    votes = [v for v in f["votes"] if not v["refuted"]]
    sevs = ", ".join(v["severity"] for v in votes)
    paths = f.get("reachable_paths") or []
    path = paths[0] if paths else ""
    if len(path) > 420:
        path = path[:420] + " …"
    r = votes[0]["reasoning"]
    reasons = f"\n> {r[:430]}{' …' if len(r) > 430 else ''}\n"
    return f"""
### {f['id']} — {f['final_severity'].upper()} — `{f['file']}:{f['line']}`

**Category:** {f['category']}  ·  **Verifier vote:** {f['keep_votes']}/3 confirmed  ·  **Severities returned by confirming verifiers:** {sevs}  ·  **Reporter originally claimed:** {f['severity']}

**Claim.** {f["claim"][:420]}{" …" if len(f["claim"]) > 420 else ""}

**How it fails.** {f["failure_scenario"][:520]}{" …" if len(f["failure_scenario"]) > 520 else ""}

**Evidence (verified present in the file by Gate A):**
```
{f["evidence"].strip()[:400]}
```
{"**Reachable path.** " + path if path else ""}

**What the verifiers said:**
{reasons}"""


rows = "\n".join(
    f"| {f['id']} | {f['final_severity']} | {f['keep_votes']}/3 | `{f['file']}:{f['line']}` | {f['category']} |"
    for f in confirmed)

ref_rows = "\n".join(
    f"| `{f['file']}:{f['line']}` | {f['severity']} claimed | {f['keep_votes']}/3 | {f['claim'][:150].replace('|', '/')} |"
    for f in refuted)

drop_rows = "\n".join(
    f"| `{f['file']}:{f['line']}` | {f['severity']} | {f['claim'][:150].replace('|', '/')} |"
    for f in dropped)

# The three critics overlapped heavily. Collapse near-duplicates by Jaccard
# similarity over content words rather than a fixed-length prefix.
def _words(g):
    return set(re.findall(r"[a-z_/.]{5,}", g["gap"].lower()))


seen_sets = []
gap_rows = ""
kept_gaps = 0
for g in sorted(gaps, key=lambda g: {"high": 0, "medium": 1, "low": 2}[g["priority"]]):
    w = _words(g)
    if any(len(w & s2) / max(1, len(w | s2)) > 0.3 for s2 in seen_sets):
        continue
    seen_sets.append(w)
    kept_gaps += 1
    gap_rows += (f"\n**[{g['priority']}]** {g['gap'][:340]}\n\n"
                 f"*Follow-up:* {g['concrete_followup'][:240]}\n")

quiet = sorted(coverage, key=lambda c: c["finding_count"])[:6]
quiet_rows = "\n".join(
    f"| {c['slice']} | {c['files_read']} | {c['finding_count']} |" for c in quiet)

TEXT = f"""# buzz — security and quality audit advisory

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
| Do the findings cite code that actually exists? | **Yes — {len(raw) - 1}/{len(raw)} ({(len(raw) - 1) / len(raw) * 100:.1f}%)** | Gate A: a script checked every quoted `evidence` string against the file. 1 finding invented code and was deleted. |
| Are the reporters' severity labels trustworthy? | **No.** | Of the {len(confirmed)} findings that survived verification, reporters claimed {sev_claim.get('critical', 0)} critical and {sev_claim.get('high', 0)} high. Verifiers rescored the same findings to **{sev_conf.get('critical', 0)} critical and {sev_conf.get('high', 0)} high**. |
| How many findings survive an adversarial re-read? | **{len(confirmed)} of 48 ({len(confirmed) / 48 * 100:.0f}%)** | 3 independent verifiers per finding, instructed to refute by default; 2-of-3 needed to survive. |
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
| 3 | Adversarial verification, 12 batches × 3 refute-by-default lenses | {len(confirmed)} survived, {len(refuted)} refuted |
| 4 | Completeness critics × 3 | {len(gaps)} coverage gaps |
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

### Recall: 4 of 10 planted defects ({canary['recall']})

Ten synthetic defects of known type and location were planted in a scratch copy
of 442 files (never in the real repository), and the breadth pass swept it blind.

| Difficulty | Found |
|---|---|
| Easy (visible when skimming) | {canary['by_difficulty']['easy'][0]}/{canary['by_difficulty']['easy'][1]} |
| Medium (needs the enclosing function) | **{canary['by_difficulty']['medium'][0]}/{canary['by_difficulty']['medium'][1]}** |
| Hard (one-token change / absent check) | {canary['by_difficulty']['hard'][0]}/{canary['by_difficulty']['hard'][1]} |

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

{len(confirmed)} findings survived: **{sev_conf.get('high', 0)} high, {sev_conf.get('medium', 0)} medium, {sev_conf.get('low', 0)} low. No critical finding survived verification.**

Ranked below by value per unit of remediation risk — that is, how much security is
gained per unit of change required. A one-line gate added next to an existing
gate ranks above a finding of similar severity that needs a protocol change.

{len(split)} of the {len(confirmed)} survived on a **split 2-of-3 vote** ({', '.join(f['id'] for f in split)}) —
one verifier actively believed each of these was wrong. They are weaker evidence
than the unanimous ones and are marked as such in the table.

| ID | Severity | Vote | Location | Category |
|---|---|---|---|---|
{rows}

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

{"".join(detail(f) for f in confirmed)}

---

## Flagged but not confirmed

### Refuted during verification ({len(refuted)})

These were reported by finding agents and then killed by 2-of-3 adversarial
verifiers. They are listed rather than buried, because a refutation is a judgement
and can itself be wrong.

| Location | Claimed | Vote | Claim |
|---|---|---|---|
{ref_rows}

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

### Triaged out before verification ({len(dropped)})

Verification capacity was 48 findings; {len(raw)} were reported and {len(dropped)} ranked below the
cut after dedup. **These were never verified — they are neither confirmed nor
refuted.** Some are probably real.

| Location | Claimed severity | Claim |
|---|---|---|
{drop_rows}

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
{quiet_rows}

### Full gap list

The three critics overlapped heavily; near-duplicates are merged below
({len(gaps)} raw gap statements collapsed to {kept_gaps} distinct ones).

{gap_rows}

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
| What the caps cut | Verification capacity of 48 findings meant **{len(dropped)} findings were never verified**. This was a triage decision, not a budget stop. |
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
"""

OUT.write_text(TEXT, encoding="utf-8")
print(f"wrote {OUT}  ({len(TEXT):,} chars)")
print(f"confirmed={len(confirmed)} refuted={len(refuted)} dropped={len(dropped)} gaps={len(gaps)}")
