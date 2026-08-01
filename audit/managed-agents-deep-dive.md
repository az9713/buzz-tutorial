# managed_agents deep dive — the gap the main audit left open

Date: 2026-08-01. Read-only. Companion to `buzz-audit-advisory.md`; nothing here
overlaps its 27 findings, because no agent in that run read this directory.

Target: `buzz/desktop/src-tauri/src/managed_agents/` — 77 Rust files, excluded
from the root cargo workspace (`Cargo.toml:32`), never analysed by clippy, no
applicable semgrep rules.

Two lenses, one agent each. Every finding below carries `file:line` the agent
read. The load-bearing lines of findings A1, B1 and B3 were re-read
independently before publishing — the prior run's calibration showed reporters
inflate, so claims that carry the verdict get checked by hand.

## A. Indirect prompt injection / confused deputy

### A1 — HIGH — a stranger's persona supplies both the system prompt and an open "anyone may command this" gate

Buzz has a persona catalog: shareable agent configs published as kind:30175
events. Three facts compose into the finding.

1. `personaCatalogRelay.ts:261-265` queries `kinds:[KIND_PERSONA]` with **no
   `authors` filter**. Every user's shared persona is fetched. (Verified.)
2. `personaCatalogRelay.ts:155-160` downgrades `respond_to: "allowlist"` to
   owner-only but passes `"anyone"` through verbatim; `:172-173` takes
   `system_prompt` as-is. (Verified.)
3. `types.rs:940-945` (`resolve_mint_behavioral_defaults`): with no explicit
   instance-level choice, **the definition's `respond_to` wins**. (Verified.)

Path to the sink: `usePersonaActions.ts:321-333` → `commands/personas/create.rs:28,54-76`
(trim only) → `commands/agents.rs:825-830` → `types.rs:941-956` →
`agents.rs:892` → `runtime.rs:380-400` (`build_respond_to_env`) emits
`BUZZ_ACP_RESPOND_TO` onto the harness process; `agents.rs:860` supplies the
prompt.

Impact: after one click the user runs an agent whose standing instructions the
attacker wrote and whose message gate accepts any npub on the relay — the
attacker can then converse with it directly, at the user's privilege. Note that
`BUZZ_ACP_RESPOND_TO` is in `RESERVED_ENV_KEYS` (`env_vars.rs:77`) *precisely
because it is a security gate*; the definition-default route walks around that
reasoning.

Bounded by: catalog entries carry no `envVars` (`personaCatalogRelay.ts:292-311`
sets `{}`), and `runtime` resolves through an id table falling back to the
bundled default (`discovery.rs:303-330`) — no arbitrary binary, no credential
injection. Needs one user click, but the UI frames it as "add an agent," not
"let strangers command it."

### A2 — MEDIUM (UNVERIFIED reachability) — inbound persona reconcile has no authorship check

`commands/personas/inbound.rs:54-183` verifies the event signature
(`parse_verified_inbound_event`, `:190-198`) but never compares `event.pubkey`
to the workspace owner. `apply_inbound_persona` (`:342-363`) matches **by d-tag
alone** and overwrites `system_prompt`, `runtime`, `model`, `provider`,
`respond_to`, `respond_to_allowlist`.

Its own comment (`:185-189`) says the TS-side owner filter "reads the same
attacker-controlled field and is no defense" — yet `usePersonaSync.ts:39` plus
the `authors:[pubkey]` filters (`:50,62`) are the only owner check in the chain.
`tauriPersonas.ts:318` is the sole wrapper and `usePersonaSync` its sole caller,
so no live bypass was demonstrated: hardening, not a proven exploit. The sibling
tombstone path *does* enforce owner scoping (`inbound.rs:219`), which makes the
omission look accidental. If reached: silent rewrite of a running agent's system
prompt at next spawn, no UI signal.

### A3 — MEDIUM — attacker-controlled `display_name` lands in the AGENTS.md every agent reads

`nest.rs:551-579` writes each agent's name and its persona's `display_name` into
the managed table in `~/.buzz/AGENTS.md`. Sanitization is `escape_md_cell`
(`nest.rs:547-549`): replaces `|` and `\n` only — **not `\r`** — with no length
cap. `display_name` is attacker-authored (`personaCatalogRelay.ts:138-141,170`)
and reaches the store with only `trim_required` (`create.rs:26`,
`personas/mod.rs:14-20`), bounded only by the relay's content ceiling.

AGENTS.md is the shared orientation file loaded by *every* Buzz-spawned agent
(`nest.rs:40`, `nest_agents.md:1-3`), regenerated on every persona/agent change
(`nest.rs:673-700`). Multi-kilobyte injected prose from one added persona
therefore reaches agents unrelated to it — wider blast radius than A1, lower
ceiling on what it achieves.

### A4 — LOW (UNVERIFIED) — `name_pool` passthrough

Arbitrary strings survive `personaCatalogRelay.ts:150-154` →
`usePersonaActions.ts:328` → `create.rs:47-52` (trim + drop-empty).
`pickBotName.ts:45-59` would pick one as an agent name, and names reach AGENTS.md
with A3's weak escaping. **No production caller of `pickBotName` was found** —
not demonstrated today, a loaded gun if wired up.

### A5 — LOW — agent `name` unvalidated

`commands/agents.rs:570-573` trims and rejects empty, no charset or length bound;
the name is an AGENTS.md sink. Locally typed today; matters as A4's landing site.

### Checked and sound

Env boundary is genuinely hardened (`env_vars.rs:108-115` rejects non-POSIX keys,
closing the `BUZZ_AUTH_TAG=x`→`getenv` bypass; `:58-90` reserves identity, relay
URL, command/args, gate; `:245-290` re-filters at spawn with NUL/size caps;
`custom_harnesses.rs:192` routes hand-authored files through the same validator).
No arbitrary command from relay data (`discovery.rs:303-330`). Inbound managed-agent
projection cannot reach secrets or harness pins (`inbound.rs:381-405`).
`agent_env.rs` and `relay_mesh.rs` take no Nostr input. The three `.md` skill files
are `include_str!` statics with zero interpolation (`nest.rs:40,44`).

## B. Memory safety, process control, Windows paths

### B1 — HIGH — on Windows the whole orphan/reap subsystem is no-ops, and the Windows teardown helper written for it is unreachable

`runtime/process.rs:63-66` hardcodes `process_is_running(_pid) -> false` on
non-unix; `:202-205` hardcodes `process_has_buzz_marker -> false`. (Both
verified.) Every reap entry point is likewise stubbed: `orphan_sweep.rs:68-71`,
`:237-238`, `:381-387`, `instance_reaper.rs:358-359`, `sweep.rs:522-523`.

Consequence: `taskkill_tree` (`process_lifecycle.rs:112`), documented at
`process_lifecycle.rs:9-10` as "the after-restart path, where only the PID
survives in the record," can never be reached on that path. Both routes gate on
the always-false predicate:

- `runtime/stop.rs:99-104` requires `is_running && belongs_to_us && has_marker`.
  All false on Windows — the child is never killed, yet `:98` takes
  `record.runtime_pid` and `:107` removes the pid file, discarding the only
  record of it.
- `terminate_untracked_pair_runtime` (`runtime/process.rs:448-469`) fires only
  for receipts passing `valid_agent_runtime_receipt`, which ANDs `is_running`
  (`:419`) and `has_marker` (`:420`). Prior-session receipts are never acted on
  and never cleaned up.

Also `restore.rs:184-188`: `if process_is_running(pid) { continue; }` is dead on
Windows (verified), so a live prior-session agent goes undetected and a **second**
harness spawns for the same pubkey/relay pair.

Not Critical because the normal path is covered by the Job Object —
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (`process_lifecycle.rs:80`) kills the tree
when the desktop dies, including on crash, because the OS closes the handle.
Exposure is the failure modes: `finish_spawn` continues with `job: None` when
assignment fails (`:142-148`), plus agents from older builds or foreign
instances. Those orphans hold `BUZZ_PRIVATE_KEY` — the agent nsec (`runtime.rs:580`)
— and a live relay connection, with no cleanup path anywhere in the product.

### B2 — MEDIUM — job assignment is a timing argument with no Windows fallback

`process_lifecycle.rs:142` calls `create_job_for_child(child.id())` *after*
`spawn()`. The doc at `:48-55` concedes the window "is NOT structurally empty"
and argues assign-latency beats buzz-acp's tens-to-hundreds of ms to spawn 24
workers. Windows auto-enrolls only descendants created *after*
`AssignProcessToJobObject` (`:97`). Preconditions: parent thread descheduled
between `spawn()` and `OpenProcess` (paging, AV filter driver, loaded box) long
enough for buzz-acp to fork. Trigger: normal stop — `runtime/stop.rs:53-54`
drops the job, killing only the enrolled set. Pre-assignment workers survive, and
per B1 nothing on Windows collects them. `CREATE_SUSPENDED` is declined at
`:57-60` as "materially more unsafe Win32"; the real trade is a probabilistic
invariant on the platform with no recovery path.

### B3 — MEDIUM — `probe_auth_status`'s "10-second timeout" hangs forever on Windows

`discovery.rs:1031` documents "On timeout the child is killed and `Unknown` is
returned; no orphaned threads or processes are left behind." The kill is
`#[cfg(unix)]` only (`:1082-1085`); the Windows arm is `let _ = child_pid;`
(`:1086-1087`). Control reaches `wait_thread.join()` (`:1089`), parked in
`child.wait()` (`:1074`) on a child nobody killed. (Verified.) Preconditions: a
probe CLI blocking past 10s — stdin is `Stdio::null()` (`:1042`), so a CLI
waiting on a TTY blocks indefinitely, as does a hung network call. Consequence:
permanent deadlock of the discovery thread plus a leaked child, on the primary
platform.

### B4 — LOW — argument injection via the comma-delimited `BUZZ_ACP_AGENT_ARGS`

`runtime.rs:584` does `agent_args.join(",")`; buzz-acp re-splits on `,` (clap
`value_delimiter`, per `custom_harnesses.rs:176-178`). A comma inside one
argument becomes two arguments downstream — argument injection, **not** command
injection: no shell, `Command::new` throughout. The invariant is enforced for
custom-harness definitions (`custom_harnesses.rs:182-188`) but not for
`ManagedAgentRecord.agent_args` (`types.rs:257`), which flows unvalidated through
`runtime.rs:288` → `:584` and `commands/agent_model_process.rs:42`. Local-config
only — `agent_snapshot.rs:26,497` deliberately exclude `agent_args` from the
published snapshot and no remote write path was found. User-config-to-agent-flag
escalation (e.g. smuggling a sandbox-bypass flag), not remote.

### B5 — LOW — `is_under_dir` System32 exclusion fails open on a verbatim/UNC prefix

`git_bash.rs:324-333` compares path components against `SystemRoot` to skip
System32 when scanning PATH for `bash.exe` (`:305`), guarding the WSL stub
(issue #2328, `:270-273`). `Path::components` yields `Prefix(Disk("C:"))` for
`C:\Windows` but `Prefix(VerbatimDisk("\\?\C:"))` for `\\?\C:\Windows\System32`;
the `eq_ignore_ascii_case` at `:328-330` compares `"C:"` vs `"\\?\C:"`, returns
false, exclusion fails open. `is_windows_apps_alias` (`:277`) does not catch it.
Same class: `resolve_shell_override` passes `None` for `system_root` (`:254`), so
a bare-name `BUZZ_SHELL` skips the exclusion entirely. Impact: a broken shell
(wsl.exe trees), not privilege gain.

### B6 — LOW / UNVERIFIED — SIGTERM to a possibly-recycled PID

`discovery.rs:1084` signals `child_pid`, a `u32` saved at `:1071` before `child`
moved into the wait thread (`:1073`). If `child.wait()` reaps in the instant
before the `remaining.is_zero()` check (`:1081`), the PID is released and could
be reused before the kill. Unix-only, sub-millisecond, same-user signal. Not
demonstrated.

### Checked and sound

`unsafe impl Send for JobHandle` (`process_lifecycle.rs:27`) — exclusively owned
`HANDLE`, `CloseHandle` is thread-safe. `OpenProcess(pid)` at `:92` is **not** a
PID-reuse race: `std::process::Child` holds the process handle, reserving the
PID. Registry block (`git_bash.rs:354-399`) correct — `div_ceil(2)` never
under-allocates, `RegCloseKey` covers every exit including `ERROR_MORE_DATA`,
two-call TOCTOU cannot overflow. `install_log_filename` (`storage.rs:68-81`)
rejects rather than sanitizes traversal. Install commands (`discovery.rs:88/120/152`)
are curl-pipe-to-shell but from a hardcoded preset table, no interpolation.
`find_via_login_shell` (`discovery.rs:821`) passes the command as `$1`.

## Coverage — read vs skipped

**Lens A.** Full: `agent_env.rs`, `env_vars.rs`, `nest.rs`, `nest_agents.md`,
`custom_harnesses.rs`, `repos.rs`, `relay_mesh.rs`, `persona_events.rs`,
`commands/personas/inbound.rs`, `commands/personas/create.rs`,
`personaCatalogRelay.ts`, `usePersonaSync.ts`, `pickBotName.ts`. Targeted:
`discovery.rs:240-360`, `types.rs:931-991`, `agents.rs:560-620,800-920`,
`usePersonaActions.ts:290-360`, `event_sync.rs:1-260`, `runtime_commands.rs:1-150`.
Skipped: tests, `config_bridge/`, `readiness/`, `retention/`, `runtime/`
internals, `teams.rs`/`team_events.rs`/`team_snapshot.rs`, and the *content* of
`screenshot_skill.md`/`nest_skill.md` (verified as non-interpolated statics, not
audited as text). **Open question:** whether team-pack import
(`team_snapshot.rs:593-613`, which does carry `definition_respond_to`) has an
untrusted-network source. Looked local-directory-driven; not chased far enough to
claim either way. That is the obvious next thread.

**Lens B.** Full: `process_lifecycle.rs`, `git_bash.rs`, `managed_node_paths.rs`,
`runtime/process.rs`, `runtime/orphan_sweep.rs`, `runtime/stop.rs`, plus
`runtime.rs:540-1024`, `discovery.rs:640-760/770-825/1020-1109`,
`restore.rs:120-260/370-405`, `shutdown.rs:160-230`, `types.rs:460-492`,
`install_exec.rs:360-436`. Skipped beyond grep context:
`runtime/instance_reaper.rs`, `runtime/sweep.rs` (macOS/Linux-only, and B1 makes
them inert on the target platform); `config_bridge/`, personas, teams, nest,
retention, all tests.

**`unsafe` accounting:** 56 grep occurrences across 9 `.rs` files; excluding
comments/doc text and the 8 in `runtime/tests.rs`, ~45 are real blocks. **25 read
in full source context** (3 `process_lifecycle.rs`, 1 `git_bash.rs`, 1
`discovery.rs`, 11 `runtime/process.rs`, 8 `runtime/orphan_sweep.rs`, 1
`shutdown.rs`). The remaining ~20 in `instance_reaper.rs`/`sweep.rs` were seen
only as grep context. **So roughly 45% of the repo's `unsafe` is now read and 55%
is still unread** — better than the advisory's zero, still not coverage.

## Method notes

Two agents, one lens each, run in parallel. A first single-agent attempt covering
both lenses stalled mid-stream; splitting it fixed that. All three subagent runs
went idle without returning results and had to be prodded — the same harness
behaviour recorded in the audit handoff notes.

This is Claude-only verification. Gate B (cross-model check) is still quota-blocked
until Aug 7, so the correlated-error caveat from the main advisory applies here in
full — with the partial exception of A1, B1 and B3, whose decisive lines were
re-read directly against the source rather than taken on the reporter's word.

Nothing in `buzz/` was modified.
