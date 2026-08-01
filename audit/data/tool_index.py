"""Build a file:line index of every static-analysis hit, for Gate C corroboration.

An agent finding that lands on a line a tool independently flagged is stronger
evidence than reasoning alone (AUDIT-PLAN.md §9a, Gate C). This does not verify
anything by itself; it just answers "did a tool also flag this line?".

Usage: python tool_index.py  -> writes tool-index.json next to this file
"""

import json
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
NEAR = 5  # lines of slack when matching a finding against a tool hit


def load_semgrep(index):
    p = HERE / "semgrep.json"
    if not p.is_file():
        return 0
    data = json.loads(p.read_text(encoding="utf-8"))
    for r in data.get("results", []):
        f = r["path"].replace("\\", "/")
        rule = r["check_id"].split(".")[-1]
        index[f].append({
            "tool": "semgrep",
            "line": r["start"]["line"],
            "rule": rule,
            "severity": r["extra"].get("severity", ""),
        })
    return len(data.get("results", []))


CLIPPY_RE = re.compile(r"^(?P<file>[^:\s][^:]*?):(?P<line>\d+):\d+: (?P<level>warning|error): (?P<msg>.*)$")


def load_clippy(index):
    n = 0
    for name in ("clippy-main.txt", "clippy-strict.txt"):
        p = HERE / name
        if not p.is_file():
            continue
        for raw in p.read_text(encoding="utf-8", errors="replace").splitlines():
            m = CLIPPY_RE.match(raw.strip())
            if not m:
                continue
            f = m.group("file").replace("\\", "/")
            if f.startswith("./"):
                f = f[2:]
            index[f].append({
                "tool": "clippy",
                "line": int(m.group("line")),
                "rule": m.group("msg")[:120],
                "severity": m.group("level"),
            })
            n += 1
    return n


def main():
    index = defaultdict(list)
    ns = load_semgrep(index)
    nc = load_clippy(index)
    out = HERE / "tool-index.json"
    out.write_text(json.dumps(index, indent=1), encoding="utf-8")
    print(f"semgrep hits: {ns}, clippy hits: {nc}, files with hits: {len(index)}")
    print(f"wrote {out}")


def corroborate(finding, index):
    """Return tool hits within NEAR lines of a finding, or []."""
    f = str(finding.get("file", "")).replace("\\", "/").lstrip("/")
    try:
        line = int(finding.get("line"))
    except (TypeError, ValueError):
        return []
    return [h for h in index.get(f, []) if abs(h["line"] - line) <= NEAR]


def _self_check():
    idx = {"a.rs": [{"tool": "clippy", "line": 100, "rule": "indexing may panic", "severity": "warning"}]}
    assert len(corroborate({"file": "a.rs", "line": 102}, idx)) == 1   # within slack
    assert corroborate({"file": "a.rs", "line": 130}, idx) == []       # too far
    assert corroborate({"file": "b.rs", "line": 100}, idx) == []       # wrong file
    assert corroborate({"file": "a.rs", "line": None}, idx) == []      # no line
    assert len(corroborate({"file": "./a.rs".lstrip("./"), "line": 100}, idx)) == 1
    print("tool_index self-check OK")


if __name__ == "__main__":
    import sys
    if "--test" in sys.argv:
        _self_check()
    else:
        main()
