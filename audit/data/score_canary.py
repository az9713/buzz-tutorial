"""Score the canary sweep: what fraction of 10 planted defects did the breadth pass find?

A planted defect counts as CAUGHT if some finding cites the same file within
LINE_SLACK lines of it. That is deliberately generous - it credits the sweep for
landing on the right code even if it described the problem imprecisely. The
resulting number is therefore an UPPER bound on recall, and the advisory says so.

Usage: python score_canary.py <canary-findings.json>
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
LINE_SLACK = 15


def norm(p):
    return str(p).replace("\\", "/").lstrip("./")


def main():
    manifest = json.loads((HERE / "canary-manifest.json").read_text(encoding="utf-8"))["defects"]
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    findings = data["findings"] if isinstance(data, dict) else data

    by_diff = {"easy": [0, 0], "medium": [0, 0], "hard": [0, 0]}
    caught = []

    for d in manifest:
        df, dl = norm(d["file"]), int(d["line"])
        hits = [f for f in findings
                if norm(f.get("file")) == df
                and isinstance(f.get("line"), int)
                and abs(f["line"] - dl) <= LINE_SLACK]
        got = bool(hits)
        by_diff[d["difficulty"]][1] += 1
        by_diff[d["difficulty"]][0] += got
        caught.append({**d, "caught": got,
                       "matched_by": [{"line": h["line"], "severity": h.get("severity"),
                                       "claim": h.get("claim")} for h in hits[:3]]})
        mark = "CAUGHT " if got else "MISSED "
        print(f"{mark} [{d['difficulty']:6}] {d['file']}:{dl}  {d['type']}")
        for h in hits[:2]:
            print(f"          -> {h.get('severity')}: {str(h.get('claim'))[:100]}")

    n = len(manifest)
    hit = sum(c["caught"] for c in caught)
    print(f"\nRECALL: {hit}/{n} ({hit / n * 100:.0f}%)")
    for k, (a, b) in by_diff.items():
        print(f"  {k:6}: {a}/{b}")

    # How much noise did the sweep produce alongside the real defects?
    planted_files = {norm(d["file"]) for d in manifest}
    in_planted_files = sum(1 for f in findings if norm(f.get("file")) in planted_files)
    print(f"\n{len(findings)} total findings across the canary tree; "
          f"{in_planted_files} of them in the 10 files that contain a planted defect")

    (HERE / "canary-score.json").write_text(
        json.dumps({"recall": f"{hit}/{n}", "by_difficulty": by_diff,
                    "total_findings": len(findings), "detail": caught}, indent=1),
        encoding="utf-8")


def _self_check():
    m = [{"file": "a.rs", "line": 100, "difficulty": "easy", "type": "t"}]
    f_near = [{"file": "a.rs", "line": 110, "severity": "high", "claim": "x"}]
    f_far = [{"file": "a.rs", "line": 200, "severity": "high", "claim": "x"}]
    f_other = [{"file": "b.rs", "line": 100, "severity": "high", "claim": "x"}]

    def hits(fs):
        d = m[0]
        return [x for x in fs if norm(x["file"]) == norm(d["file"])
                and isinstance(x.get("line"), int) and abs(x["line"] - d["line"]) <= LINE_SLACK]

    assert hits(f_near) and not hits(f_far) and not hits(f_other)
    assert norm("./a.rs") == "a.rs" and norm("a\\b.rs") == "a/b.rs"
    print("score_canary self-check OK")


if __name__ == "__main__":
    if "--test" in sys.argv:
        _self_check()
    else:
        main()
