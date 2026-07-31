# Common issues

Real failure modes only — every entry below is tied to something in this
repo (a troubleshooting table, a code comment, an error string, or a
documented gotcha), cited at the end of each row. For Linux desktop-app
rendering crashes specifically, see the dedicated
[`docs/linux-rendering-troubleshooting.md`](../linux-rendering-troubleshooting.md)
(summarized below, not duplicated).

---

## Setup and build

| Symptom | Cause | Fix |
|---|---|---|
| `just ci` (or any `just desktop-tauri-*` recipe) fails partway through `just check` with a pkg-config error like `The system library `gdk-pixbuf-2.0` required by crate `gdk-pixbuf-sys` was not found` | Hermit pins language toolchains, not system libraries. On Linux the desktop crates link GTK/WebKitGTK, which must be installed system-wide separately. | `sudo apt-get install -y --no-install-recommends build-essential curl file libasound2-dev libayatana-appindicator3-dev libgtk-3-dev librsvg2-dev libssl-dev libwebkit2gtk-4.1-dev libxdo-dev patchelf wget` (same list CI uses). If you're only touching the relay/CLI/server crates, skip this and use `just fmt-check`, `just clippy`, `just test-unit`, `just test` instead — none need GTK. |
| `cargo test` at repo root doesn't run desktop tests | The desktop crate is excluded from the root Cargo workspace. | `cargo test --manifest-path desktop/src-tauri/Cargo.toml` |
| Pre-commit hook fails on `just desktop-tauri-fmt` inside a git worktree | `cargo fmt` resolves workspace paths relative to the worktree root, not the main checkout. | Run `just desktop-tauri-fmt` from the main checkout, then re-stage and commit. CI itself is unaffected. |
| DCO Check blocks your PR | Commits are missing the `Signed-off-by` trailer. | `git commit -s` going forward; for commits already pushed, `git rebase --signoff main && git push --force-with-lease`. Run `just hooks` once to auto-sign future commits (`git rebase`/`git cherry-pick` still need their own `--signoff`/`-s` flag). |
| Tests pass locally but CI fails | `just ci` wasn't run before pushing. | `just ci` runs the full gate: fmt, clippy, unit tests, desktop/web builds. |

Sources: [CONTRIBUTING.md — Linux: Tauri system libraries](../../CONTRIBUTING.md), [AGENTS.md — Common Gotchas](../../AGENTS.md#common-gotchas), [CONTRIBUTING.md — Sign Your Commits](../../CONTRIBUTING.md), [TESTING.md — Troubleshooting](../../TESTING.md#troubleshooting).

---

## Relay and CLI

| Symptom | Cause | Fix |
|---|---|---|
| `relay error 500` or `400: restricted: not a channel member` right after a code change | Stale binary — you rebuilt but the shell is still running (or `PATH`-resolving to) the old one. | Rebuild and re-export `PATH`, or run with `cargo run` directly. |
| `Address already in use` on relay start (os error 48 on macOS, 98 on Linux) | Another relay (or a stale process) is already holding `:3000`/`:8080`/`:9102` or your overridden ports. | Read the panic line — it names the failing port. Then `lsof -iTCP:3000,8080,9102 -sTCP:LISTEN` (or your override equivalents), and kill the offender (`pkill -f buzz-relay`) or use the port-override block from TESTING.md step 3. If you already overrode ports and still collide, a previous run left a relay on those same alt ports. |
| `auth_error: BUZZ_PRIVATE_KEY is required` | The env var wasn't exported into the shell the CLI is running in. | `export BUZZ_PRIVATE_KEY=...` (or pass `--private-key`). |
| `auth_error: BUZZ_AUTH_TAG verification failed … signature verification failed` on the **local dev relay**, on the very first CLI write | A stale `BUZZ_AUTH_TAG` inherited from a parent shell; the local dev relay rejects it. | `unset BUZZ_AUTH_TAG`. |
| `auth-required: verification failed` on a closed relay | The relay requires NIP-OA owner attestation. | Set `BUZZ_AUTH_TAG` to the owner-issued JSON, or relax `BUZZ_REQUIRE_RELAY_MEMBERSHIP`. |
| `buzz channels list` comes back empty right after `channels create` | The CLI doesn't echo the new channel's UUID in `list` output by default. | Use the filter shown in TESTING.md step 4, or `POST /query` with `{"kinds":[39002]}` directly. |
| An open-ended `messages search` (no kinds specified) returns 403 | The relay's p-gate rejects `REQ`/query calls that omit an explicit `kinds` filter. | Always pass `--kinds`, e.g. `buzz messages search --kinds 9,45001,45003 ...`. |

Sources: [TESTING.md — Troubleshooting](../../TESTING.md#troubleshooting), [AGENTS.md — Common Gotchas #2–3](../../AGENTS.md#common-gotchas).

---

## ACP agents (goose / codex / claude code / buzz-agent)

| Symptom | Cause | Fix |
|---|---|---|
| Agent boots and logs `discovered 0 channel(s)` / `no channel subscriptions resolved`, then sits idle and ignores every mention | The agent's own pubkey isn't a member of any channel yet — `buzz-acp` only discovers channels the authenticated identity is a member of. | `buzz channels add-member --channel "$CHANNEL" --pubkey "$AGENT_PUBKEY" --role member`, run from a *different* (owner/sender) identity. If the agent was already running when you add it, no restart is needed — it picks up the membership notification live (`membership notification: subscribing to new channel …`). |
| Agent never responds to @mentions even though it's running and in the channel | `BUZZ_ACP_RESPOND_TO` defaults to `owner-only`, and no owner is configured — the harness drops every inbound event until an owner resolves. | Set `BUZZ_ACP_RESPOND_TO=anyone` for testing, or `allowlist` with `BUZZ_ACP_RESPOND_TO_ALLOWLIST` for a fixed set of users. |
| `buzz-acp` fails to spawn the agent subprocess on startup | `BUZZ_ACP_AGENT_COMMAND` isn't set (or points at a binary that isn't on `PATH`) for a non-default agent. Default assumes `goose` is installed and configured. | For codex/claude code/buzz-agent, set `BUZZ_ACP_AGENT_COMMAND` and `BUZZ_ACP_AGENT_ARGS` — see [`crates/buzz-acp/README.md`](../../crates/buzz-acp/README.md). |
| goose hangs on every prompt / warns about `GOOSE_MODE` | `GOOSE_MODE` isn't set. | `export GOOSE_MODE=auto` — must be `auto` or goose hangs waiting for interactive approval. |
| Running `codex-acp` standalone (outside Buzz Desktop) logs a `426 Upgrade Required` error on startup | `codex-acp` always attempts a ChatGPT WebSocket (subscription) login first; this specific failure mode is expected and non-fatal in the headless `buzz-acp` context. | It falls back to `OPENAI_API_KEY` automatically — just make sure that var is set so the fallback has something to use. See [`crates/buzz-acp/README.md` — Running with Codex](../../crates/buzz-acp/README.md#running-with-codex). |
| `buzz-acp` connects but the terminal stays quiet during a turn — how do you know it actually ran? | The current ACP build doesn't print per-turn progress to stdout by design. | Confirm with `buzz messages get --channel "$CHANNEL" --limit 5 | jq '.[] | {pubkey, content}'` — the reply is a kind:9 event from the agent's pubkey, typically 10–90s after the mention. |

Sources: [TESTING.md — ACP Harness](../../TESTING.md#acp-harness-optional-end-to-end-with-a-real-agent), [TESTING.md — Troubleshooting](../../TESTING.md#troubleshooting), [`crates/buzz-acp/README.md`](../../crates/buzz-acp/README.md).

---

## Buzz Desktop — managed agents

| Symptom | Cause | Fix |
|---|---|---|
| A "Claude Code" or "Codex" managed agent shows not-ready, with a login/setup nudge, even though `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` is set | These two runtimes are readiness-gated on the vendor CLI's own login state (`claude auth status` / `codex login status`), **not** on an API-key env var — Desktop shells out to the real `claude`/`codex` CLI via its ACP adapter and relies on that CLI's session. | Use the in-app "Sign in to Claude Code" / "Sign in to Codex" flow (or run `claude auth login` / `codex login` yourself in a terminal) so the CLI itself reports logged-in. See [`docs/user-guide/using-your-ai-subscription.md`](../user-guide/using-your-ai-subscription.md). |
| A "Buzz Agent" (built-in runtime) managed agent shows not-ready asking for a credential | `buzz-agent` calls the Anthropic/OpenAI-compatible/Databricks HTTP APIs directly — it requires a structured provider + model plus, depending on provider: `ANTHROPIC_API_KEY` (Anthropic), `OPENAI_COMPAT_API_KEY` (OpenAI-compatible), or `DATABRICKS_HOST` (Databricks; `DATABRICKS_TOKEN` is optional — OAuth PKCE is the normal path). | Set the missing structured field/env var in the agent's Edit dialog. This runtime has no subscription-login fallback. |
| The desktop app can't launch `buzz-dev-mcp`'s shell tool on Windows | Git for Windows (which ships Git Bash) isn't installed, or isn't on `PATH`. | Install Git for Windows and select "Git from the command line and also from 3rd-party software" during setup; or point Buzz at another bash-compatible shell via `BUZZ_SHELL=C:\path\to\bash.exe`. |
| Desktop shows a config-parse error nudge instead of a login prompt for Codex | `~/.codex/config.toml` has an invalid value (e.g. an unknown variant for a field) — Buzz's probe distinguishes "config is broken" from "not logged in" by checking for `error loading configuration` + `unknown variant` in the probe's stderr. | Fix the offending line in `~/.codex/config.toml` (the nudge shows the exact stderr excerpt); this is not something Buzz can repair automatically. |

Sources: [`desktop/src-tauri/src/managed_agents/discovery.rs:111-173`](../../desktop/src-tauri/src/managed_agents/discovery.rs), [`desktop/src-tauri/src/managed_agents/readiness.rs:393-394`](../../desktop/src-tauri/src/managed_agents/readiness.rs), [`crates/buzz-agent/src/config.rs:763-813`](../../crates/buzz-agent/src/config.rs), [`desktop/src-tauri/src/managed_agents/git_bash.rs:26`](../../desktop/src-tauri/src/managed_agents/git_bash.rs), [`desktop/src-tauri/src/managed_agents/readiness/cli_probe.rs`](../../desktop/src-tauri/src/managed_agents/readiness/cli_probe.rs).

---

## Linux desktop rendering (summary — see the full guide for details)

| Symptom | Likely cause | Fix |
|---|---|---|
| Blank/transparent window, then `SIGABRT` mentioning `colrv1_configure_skpaint` | AppImage bundles WebKitGTK against an older FreeType ABI than a Fedora 40+ host's `libfreetype.so.6` provides (COLRv1 color-emoji struct layout mismatch). | Upgrade to AppImage v0.5.2+ (built against `ubuntu:24.04`, raises the glibc floor to 2.39 — Ubuntu 22.04/Debian 12 users should switch to the `.deb`/`.rpm` package instead, which uses the system WebKit). |
| Blank window on startup, no crash output, on NVIDIA or AppImage | dmabuf renderer incompatibility. | `WEBKIT_DISABLE_DMABUF_RENDERER=1 ./Buzz.AppImage`, or launch with `--safe-rendering`. |
| Blank window on any hardware, no crash output | Unrecognized GPU/driver combination. | Launch with `--safe-rendering`. |

Full symptom list, root-cause detail, and workarounds:
[`docs/linux-rendering-troubleshooting.md`](../linux-rendering-troubleshooting.md).

---

## A documentation trap, not a Buzz bug: ARCHITECTURE.md is stale in places

Not a runtime failure mode, but worth flagging here because it *causes*
confusion that looks like a bug report: as of this writing, `ARCHITECTURE.md`
itself has drifted from the code in at least two places. If you hit a
mismatch between what that doc says and what you observe, trust the code:

- **Rate limiting.** `ARCHITECTURE.md` states no Redis-backed rate limiter
  exists and that only a test stub (`AlwaysAllowRateLimiter`) implements the
  `RateLimiter` trait. That's no longer accurate — `buzz-pubsub` has a
  working fixed-window Redis rate limiter (atomic `INCR`+`EXPIRE` via a Lua
  script, with self-healing if a crash leaves a key without a TTL). Its own
  comment notes fixed windows allow up to 2× burst at the window boundary,
  so treat it as real but not strict. Source:
  [`crates/buzz-pubsub/src/rate_limiter.rs:1-8`](../../crates/buzz-pubsub/src/rate_limiter.rs).
- **Max WebSocket frame size.** `ARCHITECTURE.md` states `MAX_FRAME_BYTES =
  65,536`. The actual default is `512 * 1024` (512 KiB), configurable via
  `BUZZ_MAX_FRAME_BYTES`. Source:
  [`crates/buzz-relay/src/config.rs:14`](../../crates/buzz-relay/src/config.rs).

---

**Maintenance note:** this doc tracks `TESTING.md`'s own Troubleshooting
table, `AGENTS.md`'s Common Gotchas, and the readiness/discovery code under
`desktop/src-tauri/src/managed_agents/`. If you fix a bug whose symptom was
listed here, or hit a new one that took more than a few minutes to diagnose,
update this file in the same PR.
