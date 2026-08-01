"""Gate B: re-verify confirmed findings with a DIFFERENT model family (Codex/GPT-5).

Three Claude verifiers voting 2-of-3 defends against independent error, but the
finders and verifiers share a training distribution, so their mistakes correlate
(AUDIT-PLAN.md §9a). A finding confirmed by Claude AND independently confirmed by
a non-Claude model is meaningfully stronger. Disagreements are reported as
disagreements, not resolved by majority.

Usage: python gate_b.py <confirmed.json> [max_findings]
Writes gate-b.json.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
# Path to the buzz clone being audited. Override with BUZZ_CLONE.
REPO = Path(os.environ.get("BUZZ_CLONE", HERE.parents[2] / "buzz"))
BATCH = 3
TIMEOUT = 900

PROMPT = """You are a skeptical security reviewer auditing this repository (`buzz`: a Nostr client, relay, and agent platform in Rust, TypeScript, and Dart). You are read-only; do not edit anything.

Another team's model produced the claims below. Your job is to independently decide whether each is REAL. Do not defer to the previous reviewer - you were brought in specifically because they may share a blind spot.

{items}

For each claim: open the cited file, read the surrounding code and its callers, and decide whether the described failure can actually occur in a shipped build. Check whether validation happens earlier in the call chain, whether the path is reachable at all, and whether the "attacker-controlled" input is genuinely attacker-controlled.

Default to refuted when uncertain. Confirming requires naming the concrete reachable path from an attacker-controlled entry point to the failure.

Output ONLY a JSON object as the last thing you print, in a ```json fenced block:

```json
{{"verdicts":[{{"id":"F001","confirmed":true,"severity":"critical|high|medium|low|none","reasoning":"one or two sentences"}}]}}
```
"""


def fmt(f):
    return (f"---\n**{f['id']}** - `{f['file']}:{f['line']}` [Claude verdict: {f.get('final_severity', '?')}]\n"
            f"Claim: {f['claim']}\n"
            f"Failure scenario: {f['failure_scenario']}\n"
            f"Evidence quoted:\n```\n{f['evidence']}\n```")


# On Windows the npm shim is codex.cmd, which CreateProcess will not resolve from
# the bare name "codex".
# npm's Windows shim is codex.CMD, which `which` finds; fall back to the npm prefix.
CODEX = shutil.which("codex") or str(
    Path(os.environ.get("APPDATA", "")) / "npm" / "codex.cmd")


def run_codex(prompt):
    p = subprocess.run(
        [CODEX, "exec", "--sandbox", "read-only", "--skip-git-repo-check"],
        cwd=REPO, capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=TIMEOUT, input=prompt,
    )
    return p.stdout or ""


def extract_json(text):
    blocks = re.findall(r"```json\s*(.*?)```", text, re.S)
    for b in reversed(blocks):
        try:
            return json.loads(b)
        except json.JSONDecodeError:
            continue
    # fall back to the last balanced-looking object containing "verdicts"
    m = list(re.finditer(r'\{\s*"verdicts"', text))
    if m:
        frag = text[m[-1].start():]
        for end in range(len(frag), 0, -1):
            try:
                return json.loads(frag[:end])
            except json.JSONDecodeError:
                continue
    return None


def main():
    findings = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 15
    findings = findings[:limit]

    results = {}
    for i in range(0, len(findings), BATCH):
        batch = findings[i:i + BATCH]
        ids = [f["id"] for f in batch]
        print(f"gate B: batch {i // BATCH + 1} ({', '.join(ids)}) ...", flush=True)
        try:
            out = run_codex(PROMPT.format(items="\n".join(fmt(f) for f in batch)))
        except subprocess.TimeoutExpired:
            print("  TIMEOUT - recorded as no-verdict")
            continue
        parsed = extract_json(out)
        if not parsed:
            print("  could not parse a verdict block - recorded as no-verdict")
            continue
        for v in parsed.get("verdicts", []):
            results[v.get("id")] = v
            print(f"  {v.get('id')}: {'CONFIRMED' if v.get('confirmed') else 'refuted'} ({v.get('severity')})")

    agree = disagree = missing = 0
    for f in findings:
        v = results.get(f["id"])
        if v is None:
            missing += 1
        elif v.get("confirmed"):
            agree += 1
        else:
            disagree += 1

    out = {
        "verdicts": results,
        "summary": {"submitted": len(findings), "cross_model_confirmed": agree,
                    "cross_model_disputed": disagree, "no_verdict": missing},
    }
    (HERE / "gate-b.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"\nGate B: {len(findings)} submitted -> {agree} confirmed by GPT-5, "
          f"{disagree} disputed, {missing} no verdict")


def _self_check():
    t = 'blah\n```json\n{"verdicts":[{"id":"F001","confirmed":false,"severity":"none","reasoning":"x"}]}\n```\ntrailing'
    assert extract_json(t)["verdicts"][0]["id"] == "F001"
    # unfenced fallback
    assert extract_json('noise {"verdicts":[{"id":"F2"}]} tail')["verdicts"][0]["id"] == "F2"
    # later block wins over an earlier malformed one
    t2 = '```json\n{bad}\n```\n```json\n{"verdicts":[{"id":"F3"}]}\n```'
    assert extract_json(t2)["verdicts"][0]["id"] == "F3"
    assert extract_json("no json here at all") is None
    print("gate_b self-check OK")


if __name__ == "__main__":
    if "--test" in sys.argv:
        _self_check()
    else:
        main()
