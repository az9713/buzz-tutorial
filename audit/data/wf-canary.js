export const meta = {
  name: 'buzz-audit-canary',
  description: 'Calibration: breadth sweep over a scratch copy with 10 planted defects, to measure recall',
  phases: [
    { title: 'Breadth', detail: '6 slices, one agent each, Sonnet 5' },
  ],
}

const SLICES = [
 {"name":"relay","tier":"breadth","files":79,"paths":["crates/buzz-relay"],"why":"Ingest of untrusted Nostr events from any peer; the primary attack surface."},
 {"name":"core","tier":"breadth","files":24,"paths":["crates/buzz-core"],"why":"Keys, signatures, event validation primitives. Everything downstream trusts this."},
 {"name":"auth","tier":"breadth","files":26,"paths":["crates/buzz-auth","crates/buzz-acp"],"why":"NIP-42/NIP-98 authentication, replay defence, scopes, rate limiting, and the ACP token path."},
 {"name":"media","tier":"breadth","files":27,"paths":["crates/buzz-media"],"why":"Parsers over attacker-supplied binary input; memory-safety and resource-exhaustion surface."},
 {"name":"web","tier":"breadth","files":51,"paths":["web/src"],"why":"Browser-facing surface: XSS, content injection, iframe sandboxing."},
 {"name":"mobile","tier":"breadth","files":234,"paths":["mobile/lib"],"why":"Dart client: relay transport, media upload, event parsing."}
]
const ROOT = 'C:/Users/simon/AppData/Local/Temp/claude/C--Users-simon-Downloads-buzz-me/246c14bd-8634-4529-b69c-47258b3a4d50/scratchpad/canary'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['slice', 'coverage_note', 'files_read', 'findings'],
  properties: {
    slice: { type: 'string' },
    coverage_note: {
      type: 'string',
      description: 'Honest account of what you read vs skipped and why. Do not imply coverage you did not achieve.',
    },
    files_read: {
      type: 'array',
      items: { type: 'string' },
      description: 'Repo-relative paths of files you actually opened and read.',
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'severity', 'category', 'claim', 'failure_scenario', 'evidence', 'confidence'],
        properties: {
          file: { type: 'string', description: 'Path relative to the repo root, e.g. crates/buzz-relay/src/lib.rs' },
          line: { type: 'integer' },
          severity: { enum: ['critical', 'high', 'medium', 'low'] },
          category: { type: 'string' },
          claim: { type: 'string' },
          failure_scenario: { type: 'string' },
          evidence: {
            type: 'string',
            description: 'The code that supports the claim, quoted VERBATIM from the file, 1-6 lines. Copy exactly; do not paraphrase, reformat, or elide. This is checked mechanically against the file.',
          },
          confidence: { enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
}

const PREAMBLE = `You are auditing the \`buzz\` codebase: a Nostr client, relay, and agent platform written in Rust, TypeScript, and Dart. It lives at \`${ROOT}/\` relative to your working directory.

You do NOT own this code. Produce findings, not patches. Do not edit any file.

**Path convention:** in your \`file\` fields, give paths relative to the repo root WITHOUT the \`${ROOT}/\` prefix — e.g. \`crates/buzz-relay/src/lib.rs\`, not \`${ROOT}/crates/buzz-relay/src/lib.rs\`. But when you open files with your tools, you must include the \`${ROOT}/\` prefix.

**The evidence field is checked mechanically.** A script verifies that the string you put in \`evidence\` literally appears in the file you cite, within 10 lines of the line number you give. Findings that fail are deleted without review. So: copy the code verbatim, and get the line number right. Re-read the file to confirm the line number if you are unsure.`

const NOSTR_CONTEXT = `**Domain context.** Nostr's security model: events are JSON objects signed with a secp256k1 Schnorr signature over a canonical serialization; \`id\` is the SHA-256 of that serialization. Clients and relays receive events from arbitrary untrusted peers. Recurring vulnerability classes in Nostr implementations:
- an event's \`id\` or signature is verified in one path but not another, or the parsed object is trusted before verification completes;
- the canonical serialization used for verification differs from the one used for storage or display (a parser differential);
- \`kind\`, \`created_at\`, and tag values are attacker-chosen — including timestamps far in the future or past, duplicate tags, and deeply nested or enormous tag arrays;
- NIP-42 (relay AUTH) challenge/response replay, and NIP-98 (HTTP auth) token replay across endpoints or past expiry;
- subscription filters (\`REQ\`) that let an attacker drive unbounded queries;
- relay-supplied content rendered without escaping.
The repo's own NIP documentation is in \`${ROOT}/docs/nips/\` and its stated security posture in \`${ROOT}/SECURITY.md\` — consult them when a rule's intent is unclear rather than guessing.`

function breadthPrompt(s) {
  return `${PREAMBLE}

${NOSTR_CONTEXT}

**Your slice: \`${s.name}\`** (${s.files} files)
Paths: ${s.paths.map((p) => '`' + ROOT + '/' + p + '`').join(', ')}
${s.name === 'tauri-core' ? '\nEXCLUDE `' + ROOT + '/desktop/src-tauri/src/commands/` — another agent owns it.\n' : ''}
Why this slice matters: ${s.why}

**This is a COVERAGE pass, not a deep one.** Read broadly across the whole slice rather than exhaustively into one file. Your job is to surface *candidates*; a later adversarial phase verifies them and will kill the wrong ones. Prefer naming a plausible issue with its evidence over staying silent — but do not invent findings to appear productive. Returning zero findings with an honest coverage note is a useful result.

Start by listing the files in your paths so you know the real shape of the slice, then prioritise: entry points that take external input, anything named auth/verify/validate/parse/exec/spawn/query, and configuration.

Look for: unvalidated input from the network or from another process; authentication and authorization gaps; injection (SQL, command, path, template, prompt); unsafe deserialization; secrets in source, logs, or config; missing bounds or overflow checks in Rust; \`unsafe\` blocks; \`unwrap\`/\`expect\`/\`panic!\` reachable from untrusted input; error paths that leak information or lose data; and any place where a hostile peer, relay, or event could drive behaviour the author clearly did not intend.

In \`coverage_note\`, state plainly which parts of the slice you read and which you skipped, and why. In \`files_read\`, list every file you actually opened.

Return ONLY the structured object.`
}

const LENSES = [
  {
    key: 'hostile-input',
    text: `**Lens A — hostile input.** Assume every byte entering this slice is attacker-controlled: Nostr events from any relay, relay responses, media files, push payloads, IPC messages from a compromised renderer, deep links. For each entry point, trace what an attacker controls and how far it reaches, naming the functions along the way. Look for parser differentials, resource exhaustion (unbounded allocation, unbounded loops, algorithmic complexity), TOCTOU, and validation that is performed but whose result is then not enforced. Pay attention to the gap between "we checked it" and "we acted on the check".`,
  },
  {
    key: 'crypto-identity',
    text: `**Lens B — cryptography, keys, and identity.** Focus on secret material and identity: private key generation, storage, and lifetime in memory; signature creation and — especially — signature *verification* and what happens on failure; nonce and randomness sources; token issuance, scope, and expiry; replay defences and their windows; session and permission checks. Look for verification that can be skipped, downgraded, or short-circuited (including an error branch that logs and continues), comparisons that are not constant-time where that matters, and secrets that reach logs, disk, IPC, or telemetry.`,
  },
  {
    key: 'correctness',
    text: `**Lens C — correctness.** Find defects that are NOT security vulnerabilities: race conditions, incorrect error handling, silent failure, data loss on partial writes or interrupted sync, resource leaks, off-by-one and boundary errors, incorrect state machines, and misuse of concurrency primitives (locks held across await points, lost wakeups, unbounded channels). Rank by user-visible impact — what would a user actually notice or lose?`,
  },
]

function depthPrompt(s, lens, prior) {
  const priorText =
    prior && prior.findings && prior.findings.length
      ? prior.findings.map((f) => `- ${f.file}:${f.line} [${f.severity}] ${f.claim}`).join('\n')
      : '(the breadth pass reported nothing for this slice)'
  const priorCoverage = prior && prior.coverage_note ? prior.coverage_note : '(none)'

  return `${PREAMBLE}

${NOSTR_CONTEXT}

You are performing a DEEP audit of one slice. A shallow breadth pass has already run; **your job is to find what it missed.** Read the slice's code thoroughly, including the paths it calls into and the callers that reach it — following a call out of the slice is expected and encouraged.

**Your slice: \`${s.name}\`** (${s.files} files)
Paths: ${s.paths.map((p) => '`' + ROOT + '/' + p + '`').join(', ')}
Why this slice matters: ${s.why}

**What the breadth pass already reported (do not simply repeat these):**
${priorText}

**What the breadth pass admitted it skipped:**
${priorCoverage}

That skipped list is a hint, not a boundary — the interesting defect is often in what a hurried reviewer passed over.

${lens.text}

For every finding, state the concrete path from an attacker-reachable entry point to the failure, citing file:line at each hop. A finding you cannot trace to a reachable entry point should be reported at LOW confidence and said so, not dressed up.

In \`coverage_note\`, state which files you read in depth, which you only skimmed, and which you never opened. In \`files_read\`, list every file you actually opened.

Return ONLY the structured object.`
}

// ---- Phases 1 and 2, pipelined: a slice starts its depth dive as soon as its
// sweep lands, instead of waiting for all 17 sweeps to finish.
const swept = await pipeline(
  SLICES,
  (s) =>
    agent(breadthPrompt(s), {
      label: `sweep:${s.name}`,
      phase: 'Breadth',
      model: 'sonnet',
      effort: 'medium',
      schema: SCHEMA,
    }),
  (r, s) => {
    if (s.tier !== 'depth') return { sweep: r, deep: [] }
    return parallel(
      LENSES.map((l) => () =>
        agent(depthPrompt(s, l, r), {
          label: `deep:${s.name}:${l.key}`,
          phase: 'Depth',
          model: 'fable',
          effort: 'high',
          schema: SCHEMA,
        }),
      ),
    ).then((deep) => ({ sweep: r, deep: deep.filter(Boolean) }))
  },
)

const results = swept.filter(Boolean)
const reports = []
for (const r of results) {
  if (r.sweep) reports.push({ ...r.sweep, phase: 'breadth' })
  for (const d of r.deep) reports.push({ ...d, phase: 'depth' })
}

const findings = []
for (const rep of reports) {
  for (const f of rep.findings || []) {
    findings.push({ ...f, slice: rep.slice, source_phase: rep.phase })
  }
}

const nulls = SLICES.length - results.length
log(`${reports.length} reports, ${findings.length} raw findings, ${nulls} slice(s) returned nothing at all`)

return {
  findings,
  coverage: reports.map((r) => ({
    slice: r.slice,
    phase: r.phase,
    files_read: (r.files_read || []).length,
    coverage_note: r.coverage_note,
    finding_count: (r.findings || []).length,
  })),
  files_read: reports.flatMap((r) => r.files_read || []),
  slices_attempted: SLICES.length,
  reports_returned: reports.length,
}
