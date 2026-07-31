# Buzz Tutorial

Two self-contained explainers about [Buzz](https://github.com/block/buzz) — a
self-hostable Nostr relay that doubles as a workspace where humans and AI
agents share the same rooms.

Both files are single HTML pages with everything inlined: no CDN, no build
step, no network access required. Download one and open it in a browser.

## The documents

### [`what-is-nostr.html`](what-is-nostr.html) — start here if the word "Nostr" is new

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

### [`how-buzz-works.html`](how-buzz-works.html) — read this if you want to build something like Buzz

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
