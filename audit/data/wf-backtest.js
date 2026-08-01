export const meta = {
  name: 'buzz-audit-backtest',
  description: 'Blind depth audit of pre-fix code, to test whether the audit rediscovers a known real vulnerability',
  phases: [{ title: 'Backtest', detail: '1 depth agent, Fable 5, blind to the answer' }],
}

const ROOT =
  '<scratchpad>/backtest'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['coverage_note', 'files_read', 'findings'],
  properties: {
    coverage_note: { type: 'string' },
    files_read: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'severity', 'claim', 'failure_scenario', 'evidence', 'confidence'],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { enum: ['critical', 'high', 'medium', 'low'] },
          claim: { type: 'string' },
          failure_scenario: { type: 'string' },
          evidence: { type: 'string', description: 'Code quoted verbatim from the file.' },
          confidence: { enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
}

const PROMPT = `You are performing a DEEP security audit of the Dart code under \`${ROOT}\` (29 files under \`mobile/lib/\`). Read only â€” do not edit anything. Give \`file\` paths relative to that root, e.g. \`mobile/lib/shared/relay/relay_provider.dart\`.

This is the mobile client of \`buzz\`, a Nostr social app. The files cover two onboarding paths into a community â€” joining by **invite link** (\`features/invites/\`, \`shared/deeplink/\`) and **device pairing** (\`features/pairing/\`) â€” plus the relay connection layer that both feed (\`shared/relay/\`).

Concentrate on:

- **Transport security.** Follow a relay URL end to end: how it is obtained, what validates it, what exact string gets persisted, and what scheme the socket is finally opened with. Does the scheme that was validated survive to the connection actually made? Do the two onboarding paths persist the same form of the URL? Do all the consumers that rebuild URLs from that stored value agree with each other?
- Untrusted input arriving from an invite link, deep link, or QR code, and how far it reaches.
- Signature or authentication verification that can be skipped or short-circuited.
- Anywhere two code paths derive different results from the same stored state.

Read at minimum \`shared/relay/relay_provider.dart\`, \`shared/relay/relay_session.dart\`, \`shared/relay/media_upload.dart\`, \`shared/relay/media_auth.dart\`, \`shared/deeplink/deep_link.dart\`, \`features/invites/invite_join_provider.dart\`, and \`features/pairing/pairing_provider.dart\`, and trace the data flow between them rather than reading each in isolation.

For every finding, quote the exact code in \`evidence\` and give the concrete failure. Return ONLY the structured object.`

const r = await agent(PROMPT, {
  label: 'backtest:mobile-transport',
  phase: 'Backtest',
  model: 'fable',
  effort: 'high',
  schema: SCHEMA,
})

log(`backtest returned ${r ? (r.findings || []).length : 0} findings`)
return r
