# Buzz Tutorial

Five self-contained explainers about [Buzz](https://github.com/block/buzz) — a
self-hostable Nostr relay that doubles as a workspace where humans and AI
agents share the same rooms.

Every file is a single HTML page with everything inlined: no CDN, no build
step, no network access required. Read them online, or download one and open
it in a browser.

## Read online

- [What is Nostr](https://az9713.github.io/buzz-tutorial/what-is-nostr.html)
- [How Buzz works](https://az9713.github.io/buzz-tutorial/how-buzz-works.html)
- [The Buzz trust map](https://az9713.github.io/buzz-tutorial/trust-map.html)
- [Hardening Buzz](https://az9713.github.io/buzz-tutorial/hardening.html)
- [Power user onboarding](https://az9713.github.io/buzz-tutorial/buzz-onboarding.html) — every menu item, with click paths and paste-ready workflows

From the [audit](audit/):

- [The audit advisory](https://az9713.github.io/buzz-tutorial/audit/advisory.html) — 27 confirmed findings
- [Blindspot pass](https://az9713.github.io/buzz-tutorial/audit/blindspots.html) — what the explainers above leave out
- [Phase 0 log](https://az9713.github.io/buzz-tutorial/audit/phase0-log.html) — how the audit was set up and calibrated
- [Codebase knowledge graph](https://az9713.github.io/buzz-tutorial/audit/graph/graph.html) — interactive

## The documents

### [`what-is-nostr.html`](https://az9713.github.io/buzz-tutorial/what-is-nostr.html) — start here if the word "Nostr" is new

Nostr from zero, then how Buzz uses it.

- **Part one** builds the protocol up from nothing: why it exists, then the
  three primitives — a keypair *is* your identity, an event is a signed JSON
  object, a relay is a dumb store-and-forward server. Walks an event's fields
  one at a time, shows the `EVENT` / `REQ` / `CLOSE` wire protocol, and
  explains what NIPs are. Ends with the honest tradeoffs: lose your private
  key and there is no recovery, spam is harder without accounts, and metadata
  leaks even when content is encrypted.
- **Part two** grounds all of it in the Buzz codebase — which NIPs are
  actually implemented and how heavily, Buzz's custom kind ranges, its 15
  in-tree draft NIPs, Blossom media storage, and why "an AI agent is just
  another keypair" falls directly out of part one. Includes the tension the
  design has to live with: vanilla Nostr is an open multi-relay mesh, while
  Buzz is a deliberately narrowed single-relay workspace.
- **Part three** is a short list of verified pointers for learning more.

### [`how-buzz-works.html`](https://az9713.github.io/buzz-tutorial/how-buzz-works.html) — read this if you want to build something like Buzz

The reasoning behind the architecture, aimed at an engineer who has never
seen the project and wants the *why* rather than the API surface.

Nine sections: the problem before any architecture · the one bet · top-down
or bottom-up (with an actual answer) · why adopt Nostr instead of inventing a
protocol · the architecture layer by layer · the agent surface · the tech
stack and what you could substitute · a concrete build order · what is
actually hard.

The spine is a single question: *if I were building this from scratch, what
order would I think in, and why?* The answer it argues for is that exactly
two decisions must be settled top-down before any code — the event/identity
model and the tenancy boundary — because those are the only ones that are
both global and irreversible. An event's `id` is a hash of its own canonical
serialization and its `sig` signs that hash, so the serialization rules are
frozen *in the data*: change them and every event you have already signed
stops verifying. Everything else is bottom-up and replaceable behind a seam.

### [`trust-map.html`](https://az9713.github.io/buzz-tutorial/trust-map.html) — read this if you are deciding whether to deploy Buzz

Six things Buzz is expected to keep safe — channel message content, DM
content, channel membership, cross-community tenant isolation, agent authority
to act, and media blob access. For each: the single mechanism that actually
enforces it, the single artifact that verifies that mechanism, and whether
that verification is switched on in a default deployment.

Four of the six are weaker or differently shaped than the architecture
documents suggest. The headline findings, each cited to a file and line:
Buzz's confidentiality is authorisation rather than encryption (DMs included);
media downloads require no auth by default, so the SHA-256 hash is the entire
access control; the ACP bridge auto-approves every agent permission request;
and the machine-checked tenant-isolation proof is stated relative to a
Postgres row-level-security backstop that is not present in the repository, so
a forgotten `WHERE community_id` predicate fails open rather than closed.

### [`hardening.html`](https://az9713.github.io/buzz-tutorial/hardening.html) — the remediation companion to the trust map

For each gap the trust map found: what an operator can do today with no upstream
cooperation, what the upstream change would actually be, what it would cost, and
why one of them is better left alone.

Two items are actionable immediately — set `BUZZ_REQUIRE_MEDIA_GET_AUTH=true`
(after testing your clients, since the default is off for a stated staged-rollout
reason), and treat any channel an agent watches as a channel where any member can
issue instructions with that agent's privileges. The remaining three are ranked by
fix-value per unit of risk rather than by severity: the prompt-delimiting fix is
first because the project already established the convention elsewhere in-tree, and
building row-level security is last because getting `SET LOCAL` wrong under
connection pooling produces a system that passes its tests and leaks anyway.

This is an advisory. Nothing in it has been submitted to `block/buzz`, and
`SECURITY.md` there asks that vulnerabilities not go through public issues.

### [`buzz-onboarding.html`](https://az9713.github.io/buzz-tutorial/buzz-onboarding.html) — read this if you actually have to use Buzz tomorrow

The other pages explain how Buzz works. This one explains how to work it. Every
item in the desktop app's main sidebar and settings sidebar, at v0.5.3: what it
does, the exact click path to reach it, and a worked example where one helps.

Written against the source rather than from the running app — labels, click
paths, the settings grouping, all 25 keyboard shortcuts and the workflow schema
are quoted from the files they live in, with file and line cited underneath.

The centre of it is a workflow cookbook: eight YAML recipes that paste straight
into the create-workflow dialog's `Edit as YAML` mode, covering all five triggers
and all seven actions, plus the six traps the validator enforces — dashes in step
ids, the 60-second interval floor, the dotted-versus-underscored variable split,
and why `call_webhook` needs owner authority rather than membership.

It carries the audit's caveats forward where they touch a feature, and states its
own coverage limits: the Agents interface is roughly 40,000 lines, and this covers
its concepts and main paths, not every dialog.

## Provenance and accuracy

Every architectural claim is traceable to the
[block/buzz](https://github.com/block/buzz) repository, cited by file and
section. Where the documents infer rationale rather than quote it, they say
so explicitly — "the docs say X" is kept separate from "my read of why".

The NIP list in `what-is-nostr.html` was produced by counting references
across `crates/**/*.rs` rather than by reading documentation, and external
links were fetched and confirmed to resolve on 31 July 2026. The Nostr
ecosystem moves quickly and links rot; treat that date as the freshness
stamp.

These are unofficial community documents. They are not produced or endorsed
by Block, Inc. For authoritative material see the upstream
[README](https://github.com/block/buzz/blob/main/README.md) and
[ARCHITECTURE.md](https://github.com/block/buzz/blob/main/ARCHITECTURE.md).

## License

The documents in this repository are released under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Buzz itself is
Apache 2.0.
