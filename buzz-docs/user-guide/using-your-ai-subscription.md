# Using your AI subscription with Buzz agents

**Short answer:** yes. If you add a **Claude Code** or **Codex** agent in
Buzz Desktop, it signs in the same way the standalone `claude` or `codex`
command-line tool does — so your existing **Claude Pro/Max** or **ChatGPT
Plus/Pro** subscription works, and you don't need to buy or paste in a
separate metered API key. This page covers that path, what it doesn't
cover, and how to tell which one you're actually using.

---

## The two ways to pay for an agent

Buzz can run an AI agent two structurally different ways, and they have
different billing:

- **"Sign in with your account"** — Buzz hands off to the real Claude Code
  CLI or Codex CLI and lets *that* program handle login, the same way it
  would if you'd installed it yourself and typed `claude login` or
  `codex login` in a terminal. If you're signed in there with a Claude
  Pro/Max or ChatGPT Plus/Pro subscription, usage is covered by that
  subscription — no separate API bill.
- **"Bring your own API key"** — Buzz calls the Anthropic or OpenAI-compatible
  HTTP API directly with a metered key you paste in yourself. This is
  billed per token, separately from any ChatGPT/Claude.ai subscription you
  have.

Which one you get depends on which **agent type** you choose when you add
the agent. This is a per-agent choice, not a global app setting.

| Agent type | Subscription sign-in available? | What it calls |
|---|---|---|
| **Claude Code** | Yes | The real Claude Code CLI on your machine |
| **Codex** | Yes | The real Codex CLI on your machine |
| **Buzz Agent** (Buzz's own built-in agent) | No — API key only | Anthropic/OpenAI-compatible/Databricks APIs directly |

If you want to use a Claude Pro/Max or ChatGPT Plus/Pro subscription,
choose **Claude Code** or **Codex** as the agent type — not **Buzz Agent**.
Buzz Agent has no subscription option; it always asks for a metered API key
(or Databricks credentials).

---

## Setting up Claude Code with your Claude subscription

1. Install the Claude Code CLI if you haven't already (Buzz will prompt you
   with the install command if it doesn't find it — this is the same
   `claude` command-line tool Anthropic ships, not something Buzz-specific).
2. In Buzz, add a new agent and choose **Claude Code** as its type.
3. If it isn't already signed in, you'll see a **"Sign in to Claude Code"**
   button. Click it. When more than one sign-in method is available, Buzz
   automatically picks the subscription option for you rather than the
   metered-key one.
4. This runs the same login flow as `claude auth login --claudeai` — it
   authorizes against your Claude.ai account, not an API key. Complete
   whatever prompt appears (typically a browser authorization step).
5. Once signed in, the agent shows as ready. You never had to find, copy,
   or paste an API key.

## Setting up Codex with your ChatGPT subscription

1. Install the Codex CLI if needed (again, Buzz will show you the install
   command if it's missing).
2. In Buzz, add a new agent and choose **Codex** as its type.
3. Click **"Sign in to Codex"**. Buzz deliberately hides the API-key sign-in
   option during this setup step for Codex, so the button you see takes you
   straight to the ChatGPT-account login (equivalent to running
   `codex login` yourself) — a terminal window opens for you to complete it.
4. Once `codex login status` reports you're logged in, the agent is ready.

## How Buzz decides whether an agent is "ready"

For **Claude Code** and **Codex** agents specifically, Buzz never checks for
`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` at all — readiness is based purely
on whether the underlying CLI reports itself logged in (`claude auth
status` / `codex login status`). So if you already ran `claude login` or
`codex login` yourself in a terminal before touching Buzz, Buzz will detect
that and the agent will just work — nothing further to configure.

For a **Buzz Agent**, readiness is the opposite: it's based entirely on
whether the right API credential is present (`ANTHROPIC_API_KEY`,
`OPENAI_COMPAT_API_KEY`, or Databricks host/token) — there is no CLI login
step, and no subscription fallback.

---

## Where this does *not* apply

This subscription sign-in is a Buzz Desktop feature. If you (or an
operator) run Buzz's agent bridge directly on a server without the desktop
app — the `buzz-acp` command-line tool, used for always-on bots — that path
is documented and tested with metered API keys
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), not subscriptions. In that
specific headless setup, the Codex adapter does *attempt* a ChatGPT
subscription login first, but it's known to fail there (an "upgrade
required" — HTTP 426 — error) and silently falls back to the API key — so
don't rely on a subscription working in a server-run `buzz-acp` deployment
even if it works in the desktop app.

---

## How we verified this (technical appendix)

Everything above is a description of what the code actually does, not a
guess. If you're curious or something doesn't match what you see, these are
the exact places to look (verified against `block/buzz` git `main` @
`b1b283cd4`):

- **Claude Code and Codex are CLI-login runtimes, not API-key runtimes, in
  Buzz Desktop.** Their catalog entries set `auth_probe_args` to
  `["claude", "auth", "status"]` at
  [`desktop/src-tauri/src/managed_agents/discovery.rs:140`](../../desktop/src-tauri/src/managed_agents/discovery.rs)
  and `["codex", "login", "status"]` at
  [`discovery.rs:173`](../../desktop/src-tauri/src/managed_agents/discovery.rs);
  the full `KnownAcpRuntime` entries run from line 111 (Claude Code) and
  line 143 (Codex) of that file. Neither sets a `model_env_var`/`provider_env_var`
  the way API-key runtimes do.
- **The readiness check literally runs the probe command and reads its exit
  code**, not an env var:
  [`desktop/src-tauri/src/managed_agents/readiness/cli_login.rs`](../../desktop/src-tauri/src/managed_agents/readiness/cli_login.rs)
  calls
  [`desktop/src-tauri/src/managed_agents/readiness/cli_probe.rs`](../../desktop/src-tauri/src/managed_agents/readiness/cli_probe.rs)'s
  `login_probe()`, which spawns `<binary> auth status` / `login status` and
  treats exit 0 as logged in. The `agent_readiness()` docstring states this
  explicitly: "codex: a successful `codex login status` probe (checks the
  codex credential store — NOT `OPENAI_API_KEY`)" —
  [`desktop/src-tauri/src/managed_agents/readiness.rs:393-394`](../../desktop/src-tauri/src/managed_agents/readiness.rs).
- **The "Sign in" button runs the subscription login command directly for
  Claude.** `is_claude_subscription_login()` matches auth method ids
  `claude-login`/`claude-ai-login` at
  [`desktop/src-tauri/src/commands/agent_auth.rs:219-220`](../../desktop/src-tauri/src/commands/agent_auth.rs),
  and `run_claude_subscription_login()` (starting line 223) executes that
  command — a test in the same file pins the exact command as
  `["claude", "auth", "login", "--claudeai"]` with the method description
  "Use Claude subscription" at
  [`agent_auth.rs:594`](../../desktop/src-tauri/src/commands/agent_auth.rs).
  Any other terminal-style login method (this is how Codex's ChatGPT login
  is launched) opens a visible terminal instead, via `launch_terminal_auth()`
  at [`agent_auth.rs:249`](../../desktop/src-tauri/src/commands/agent_auth.rs).
- **The onboarding UI actively prefers the subscription method for Claude
  and hides the API-key method for Codex.**
  `isSupportedOnboardingAuthMethod()` (line 397) filters out any Codex
  method whose id/name matches `/api[-_]?key/i`, and
  `isPreferredClaudeAuthMethod()` (line 405) picks whichever advertised
  method's id/name/description mentions "claudeai"/"claude ai"/"subscription" —
  [`desktop/src/features/onboarding/ui/SetupStep.tsx:397-442`](../../desktop/src/features/onboarding/ui/SetupStep.tsx).
  The "Sign in to Claude Code" / "Sign in to Codex" button text comes from
  `aria-label={`Sign in to ${runtime.label}`}` at
  [`SetupStep.tsx:153`](../../desktop/src/features/onboarding/ui/SetupStep.tsx).
- **Buzz Agent (the built-in runtime) requires a metered credential and has
  no login-CLI path at all.** `Config::from_env()` requires
  `ANTHROPIC_API_KEY` for the Anthropic provider and `OPENAI_COMPAT_API_KEY`
  for the OpenAI-compatible provider (Databricks requires `DATABRICKS_HOST`,
  with `DATABRICKS_TOKEN` optional because OAuth PKCE is the normal path) —
  [`crates/buzz-agent/src/config.rs:763-813`](../../crates/buzz-agent/src/config.rs).
  The desktop readiness gate mirrors this for `buzz-agent`/`goose` starting
  at
  [`desktop/src-tauri/src/managed_agents/readiness.rs:505`](../../desktop/src-tauri/src/managed_agents/readiness.rs).
- **The standalone `buzz-acp` harness documents API keys, and documents the
  Codex subscription-login failure explicitly.** Its own README's "Running
  with Claude Code" section sets `export ANTHROPIC_API_KEY=...`; its
  "Running with Codex" section sets `export OPENAI_API_KEY=...` with the
  note: "`codex-acp` always attempts a ChatGPT WebSocket login first, which
  logs a `426 Upgrade Required` error. This is expected and non-fatal — it
  falls back to `OPENAI_API_KEY` automatically." —
  [`crates/buzz-acp/README.md`](../../crates/buzz-acp/README.md) ("Running
  with Claude Code" and "Running with Codex" sections).

**Nothing here is speculative** — every claim traces to one of the file/line
references above, all re-read directly from `block/buzz` @ `b1b283cd4` while
writing this document.
