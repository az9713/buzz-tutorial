"""Generate wf-verify.js (Phases 3-4) with the surviving findings embedded.

Workflow scripts have no filesystem access and `args` arrives stringified, so the
data is baked into the script instead of passed in.

Usage: python make_verify.py <gate-a-pass.json> <coverage.json> [max_findings]
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
SEV_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1}
CONF_RANK = {"high": 3, "medium": 2, "low": 1}
BATCH = 4


def dedupe(findings):
    """Collapse findings that name the same file and line (within 3 lines).

    Keeps the highest-severity version and records how many agents independently
    reported it - agreement across lenses is itself signal.
    """
    buckets: dict[tuple, list] = {}
    for f in findings:
        key = (str(f.get("file", "")).replace("\\", "/"), (int(f.get("line") or 0)) // 4)
        buckets.setdefault(key, []).append(f)

    out = []
    for group in buckets.values():
        group.sort(key=lambda f: (SEV_RANK.get(f.get("severity"), 0),
                                  CONF_RANK.get(f.get("confidence"), 0)), reverse=True)
        best = dict(group[0])
        best["reported_by"] = sorted({f".{g.get('slice')}/{g.get('source_phase')}" for g in group})
        best["duplicate_count"] = len(group)
        out.append(best)
    return out


def triage(findings, limit):
    findings.sort(key=lambda f: (SEV_RANK.get(f.get("severity"), 0),
                                 CONF_RANK.get(f.get("confidence"), 0),
                                 f.get("duplicate_count", 1)), reverse=True)
    return findings[:limit], findings[limit:]


LENSES = [
    ("reachability",
     "Your lens is REACHABILITY. Ignore whether the described bug would be bad. Ask only: can control flow actually get there in a shipped build? Find the callers. Is the function dead code, test-only, behind a feature flag that ships off, behind a `#[cfg(test)]`, gated on a debug build, or reachable only by someone who already has the privilege the finding claims they would gain? If the claimed attacker input is in fact set by trusted local code and never by a remote peer, the finding is refuted."),
    ("exploitability",
     "Your lens is EXPLOITABILITY. Assume the code path IS reachable. Ask: does an attacker actually gain anything? Trace what they must already control, and what they end up controlling. A panic in a task that is caught and restarted, an integer overflow on a value that cannot exceed a small bound, a 'secret' that is a public key, an unbounded allocation already capped by an upstream frame-size limit - all refuted. State the concrete attacker input and the concrete gain, or refute."),
    ("code-reading",
     "Your lens is CODE-READING CORRECTNESS. Assume the finding's author misread the code, because that is the most common failure. Re-read the cited lines and everything they call. Did they miss a `?`, an early return, a guard clause above, a validation performed by the caller, a wrapper type that already enforces the invariant, a `match` arm that handles the case, or a trait impl that is not the one they assumed? Does the quoted evidence actually mean what they say it means? If the code does not say what the finding claims, refute."),
]


def main():
    pass_path, cov_path = sys.argv[1], sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 40

    findings = json.loads(Path(pass_path).read_text(encoding="utf-8"))
    coverage = json.loads(Path(cov_path).read_text(encoding="utf-8"))

    deduped = dedupe(findings)
    kept, dropped = triage(deduped, limit)
    for i, f in enumerate(kept):
        f["id"] = f"F{i + 1:03d}"

    batches = [kept[i:i + BATCH] for i in range(0, len(kept), BATCH)]

    script = TEMPLATE.replace("__BATCHES__", json.dumps(batches, indent=1)) \
                     .replace("__LENSES__", json.dumps([{"key": k, "text": t} for k, t in LENSES], indent=1)) \
                     .replace("__COVERAGE__", json.dumps(coverage, indent=1)) \
                     .replace("__NBATCH__", str(len(batches))) \
                     .replace("__NAGENTS__", str(len(batches) * 3 + 3))

    out = HERE / "wf-verify.js"
    out.write_text(script, encoding="utf-8", newline="\n")

    Path(HERE / "triage-kept.json").write_text(json.dumps(kept, indent=1), encoding="utf-8")
    Path(HERE / "triage-dropped.json").write_text(json.dumps(dropped, indent=1), encoding="utf-8")

    print(f"{len(findings)} gate-A survivors -> {len(deduped)} after dedupe -> "
          f"{len(kept)} triaged in ({len(dropped)} held back)")
    print(f"{len(batches)} batches x 3 lenses = {len(batches) * 3} verifiers + 3 critics")
    print(f"wrote {out}")


TEMPLATE = r"""export const meta = {
  name: 'buzz-audit-verify',
  description: 'Phases 3-4 of the buzz audit: adversarial refute-by-default verification, then completeness critics',
  phases: [
    { title: 'Verify', detail: '__NBATCH__ batches x 3 lenses, refute-by-default, 2-of-3 to survive' },
    { title: 'Critic', detail: '3 completeness critics' },
  ],
}

const BATCHES = __BATCHES__
const LENSES = __LENSES__
const COVERAGE = __COVERAGE__
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
"""

if __name__ == "__main__":
    main()
