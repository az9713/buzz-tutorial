export const meta = {
  name: 'buzz-audit-sweep',
  description: 'Phases 1-2 of the buzz audit: breadth sweep of every slice, then 3-lens depth dives on the risk slices',
  phases: [
    { title: 'Breadth', detail: '17 slices, one agent each, Sonnet 5' },
    { title: 'Depth', detail: '8 risk slices x 3 lenses, Fable 5' },
  ],
}

const SLICES = [
 {
  "name": "relay",
  "tier": "depth",
  "files": 79,
  "paths": [
   "crates/buzz-relay"
  ],
  "why": "Ingest of untrusted Nostr events from any peer; the primary attack surface. Graphify: `crates/buzz-relay/src/handlers/ingest.rs` (degree 213) is THE untrusted-input entry point. Note that `ingest_event_inner()` there validates event kinds by calling `is_relay_admin_kind()` and `is_identity_archive_request_kind()`, which are defined in `crates/buzz-core/src/kind.rs` - a privilege-relevant check that lives outside the crate. Read both sides of that call."
 },
 {
  "name": "core",
  "tier": "depth",
  "files": 24,
  "paths": [
   "crates/buzz-core"
  ],
  "why": "Keys, signatures, event validation primitives. Everything downstream trusts this."
 },
 {
  "name": "auth",
  "tier": "depth",
  "files": 26,
  "paths": [
   "crates/buzz-auth",
   "crates/buzz-acp"
  ],
  "why": "NIP-42/NIP-98 authentication, replay defence, scopes, rate limiting, and the ACP token path. NOTE: crates/buzz-auth was absent from the provisional plan entirely. Also compare crates/buzz-auth/src/nip98_replay.rs against crates/buzz-pubsub/src/nip98_replay.rs - duplicated replay-defence logic in two crates is a divergence risk. Graphify also found buzz-auth and buzz-pubsub in one tightly-coupled community (49 nodes): pub/sub is entangled with auth checks rather than merely consuming them. `crates/buzz-pubsub` is owned by the gateway-mesh slice, but read across the boundary where auth decisions are made or re-made there."
 },
 {
  "name": "media",
  "tier": "depth",
  "files": 27,
  "paths": [
   "crates/buzz-media"
  ],
  "why": "Parsers over attacker-supplied binary input; memory-safety and resource-exhaustion surface."
 },
 {
  "name": "tauri-commands",
  "tier": "depth",
  "files": 97,
  "paths": [
   "desktop/src-tauri/src/commands"
  ],
  "why": "The Rust<->JS trust boundary: graphify counted 205 `#[tauri::command]` handlers across 76 files, every one callable by a compromised or XSS'd renderer. The surface is NOT evenly spread - it concentrates in the command files that reach into buzz-core (`agents.rs`, `channels.rs`, `channel_window.rs`, `engrams.rs`, `identity.rs`, `messages.rs`, `pairing.rs`, `profile.rs`, `teams.rs`, `team_snapshot.rs`, `personas/*`) and especially the 8 that reach buzz-sdk and can therefore drive the `sign()` path (`agents.rs`, `engrams.rs`, `identity.rs`, `identity_archive.rs`, `messages.rs`, `personas/snapshot/import.rs`, `team_snapshot.rs`). Prioritise those. For each, ask: what can the renderer make this sign, read, or write?"
 },
 {
  "name": "desktop-shared",
  "tier": "depth",
  "files": 328,
  "paths": [
   "desktop/src/shared"
  ],
  "why": "Shared API client, relay websocket handling, and lib code that every feature depends on - highest blast radius in the frontend."
 },
 {
  "name": "desktop-messages",
  "tier": "depth",
  "files": 367,
  "paths": [
   "desktop/src/features/messages",
   "desktop/src/features/channels",
   "desktop/src/features/forum",
   "desktop/src/features/custom-emoji"
  ],
  "why": "Rendering of attacker-authored content: XSS, content injection, markdown/emoji parsing."
 },
 {
  "name": "mobile",
  "tier": "depth",
  "files": 330,
  "paths": [
   "mobile/lib",
   "mobile/ios",
   "mobile/android",
   "mobile/scripts"
  ],
  "why": "Dart - the language with the weakest static-analysis coverage here, so it leans hardest on agent reading. Includes the iOS/Android native shells: entitlements, Info.plist, AndroidManifest permissions, exported components, and deep-link/intent filters are all attack surface a Dart-only read would miss."
 },
 {
  "name": "db",
  "tier": "depth",
  "files": 56,
  "paths": [
   "crates/buzz-db",
   "migrations",
   "crates/buzz-sdk"
  ],
  "why": "Persistence plus the event-builder/signing SDK. Graphify's centrality analysis names `crates/buzz-db/src/lib.rs` (degree 243; defines Db, Result, CommunityId used across nearly every crate) and `crates/buzz-sdk/src/builders.rs` (degree 255, including `sign()`) as the two single files with the widest blast radius in the entire Rust scope - a defect in either reaches almost everything downstream. Audit injection, integrity, migration safety, and every path that reaches `sign()`."
 },
 {
  "name": "gateway-mesh",
  "tier": "breadth",
  "files": 40,
  "paths": [
   "crates/buzz-push-gateway",
   "crates/buzz-pubsub",
   "crates/buzz-relay-mesh",
   "crates/buzz-pair-relay"
  ],
  "why": "Outbound trust boundaries: third-party push services, pub/sub fan-out, and relay-to-relay gossip between mutually distrusting nodes."
 },
 {
  "name": "agent-surface",
  "tier": "breadth",
  "files": 52,
  "paths": [
   "crates/buzz-agent",
   "crates/buzz-dev-mcp",
   "crates/buzz-persona",
   "crates/buzz-workflow"
  ],
  "why": "Agent-facing surfaces: MCP tools, persona packs, and workflow execution - prompt/tool injection and untrusted-manifest handling. Graphify: buzz-dev-mcp clusters with buzz-relay and the Tauri egress guard - check whether an MCP tool can reach network egress or relay internals that a normal user path cannot."
 },
 {
  "name": "tooling-identity",
  "tier": "breadth",
  "files": 106,
  "paths": [
   "crates/buzz-cli",
   "crates/buzz-ws-client",
   "crates/buzz-search",
   "crates/buzz-voice",
   "crates/buzz-audit",
   "crates/buzz-admin",
   "crates/git-credential-nostr",
   "crates/git-sign-nostr",
   "crates/buzz-pairing-cli",
   "crates/sprig",
   "crates/buzz-test-client",
   "crates/buzz-conformance"
  ],
  "why": "Everything else in crates/. git-credential-nostr and git-sign-nostr touch real credentials and signing; buzz-audit is the tamper-evidence log. None of these appeared in the provisional slice table."
 },
 {
  "name": "tauri-core",
  "tier": "breadth",
  "files": 183,
  "paths": [
   "desktop/src-tauri/src",
   "desktop/src-tauri/capabilities",
   "desktop/src-tauri/tauri.conf.json"
  ],
  "why": "The rest of the Tauri backend: secret_store, relay_admission, native_websocket, managed_agents, migrations, plus the capability/CSP configuration that decides what the webview may do. EXCLUDE desktop/src-tauri/src/commands (covered by the tauri-commands slice). Graphify flagged `desktop/src-tauri/src/egress_guard.rs` as sitting in one community with `crates/buzz-relay` and the `buzz-dev-mcp` tooling crate - a network-egress security control coupled to dev tooling. Check whether dev/MCP paths can weaken or bypass the egress guard in a shipped build. Also note `commands/` and `managed_agents/` are heavily co-mingled rather than cleanly separated."
 },
 {
  "name": "desktop-agents",
  "tier": "breadth",
  "files": 322,
  "paths": [
   "desktop/src/features/agents",
   "desktop/src/features/workflows",
   "desktop/src/features/mesh-compute"
  ],
  "why": "Frontend agent orchestration: tool invocation, remote compute, and anything that turns model output into an action."
 },
 {
  "name": "desktop-rest",
  "tier": "breadth",
  "files": 604,
  "paths": [
   "desktop/src/main.tsx",
   "desktop/src/types",
   "desktop/src/testing",
   "desktop/public",
   "desktop/src/features/onboarding",
   "desktop/src/features/profile",
   "desktop/src/features/settings",
   "desktop/src/features/sidebar",
   "desktop/src/features/home",
   "desktop/src/features/communities",
   "desktop/src/features/huddle",
   "desktop/src/features/projects",
   "desktop/src/features/moderation",
   "desktop/src/features/notifications",
   "desktop/src/features/reminders",
   "desktop/src/features/pulse",
   "desktop/src/features/search",
   "desktop/src/features/local-archive",
   "desktop/src/features/identity-archive",
   "desktop/src/features/presence",
   "desktop/src/features/community-members",
   "desktop/src/features/agent-memory",
   "desktop/src/features/user-status",
   "desktop/src/features/channel-templates",
   "desktop/src/features/chat",
   "desktop/src/app"
  ],
  "why": "The remaining frontend features. Onboarding and identity-archive handle key material; moderation and settings hold privilege decisions."
 },
 {
  "name": "web",
  "tier": "breadth",
  "files": 58,
  "paths": [
   "web/src",
   "admin-web/src"
  ],
  "why": "Browser-facing surface, including the admin dashboard - admin UIs are a privilege-escalation target."
 },
 {
  "name": "supply-chain",
  "tier": "breadth",
  "files": 205,
  "paths": [
   "deploy",
   ".github",
   "scripts",
   "bin",
   "desktop/scripts",
   "web/scripts",
   "Justfile",
   "lefthook.yml",
   "Dockerfile",
   "Dockerfile.push-gateway",
   "docker-compose.yml",
   "pnpm-workspace.yaml",
   "renovate.json",
   "deny.toml",
   ".env.example"
  ],
  "why": "CI/CD, container images, Helm charts, and release scripts: secrets exposure, workflow injection, and unpinned or unverified dependencies."
 }
]
const ROOT = 'buzz'

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
