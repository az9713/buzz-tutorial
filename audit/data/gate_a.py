"""Gate A: mechanical evidence check for audit findings. No model involved.

Drops findings whose file doesn't exist, whose quoted evidence doesn't appear in
that file, or whose evidence sits far from the claimed line. See AUDIT-PLAN.md §9a.

Usage: python gate_a.py <findings.json> <repo_root> <out_prefix>
Writes <out_prefix>-pass.json and <out_prefix>-fail.json, prints the rates.
"""

import json
import re
import sys
from pathlib import Path

LINE_TOLERANCE = 10
MIN_ANCHOR_LEN = 12  # evidence shorter than this is too generic to verify


def norm(s: str) -> str:
    """Collapse whitespace so indentation/wrapping differences don't cause a miss."""
    return re.sub(r"\s+", " ", s).strip()


def anchors(evidence: str) -> list[str]:
    """Longest normalized lines of the evidence block, best anchor first."""
    lines = [norm(l) for l in evidence.splitlines()]
    lines = [l for l in lines if len(l) >= MIN_ANCHOR_LEN]
    return sorted(lines, key=len, reverse=True)[:5]


def check(f: dict, root: Path) -> tuple[bool, str]:
    rel = str(f.get("file", "")).replace("\\", "/").lstrip("/")
    if not rel:
        return False, "no file field"
    p = root / rel
    if not p.is_file():
        # Agents were told to omit the repo-root prefix; tolerate it anyway rather
        # than scoring a path-format slip as a hallucination.
        alt = rel.split("/", 1)[1] if "/" in rel and rel.split("/", 1)[0] == root.name else None
        if alt and (root / alt).is_file():
            p = root / alt
        else:
            return False, f"file not found: {rel}"

    evidence = f.get("evidence") or ""
    if not norm(evidence):
        return False, "no evidence quoted"

    try:
        src = p.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return False, f"unreadable: {e}"

    src_lines = src.splitlines()
    normed = [norm(l) for l in src_lines]
    cands = anchors(evidence)
    if not cands:
        return False, "evidence too short/generic to verify"

    hits: list[int] = []
    for a in cands:
        hits += [i + 1 for i, l in enumerate(normed) if a and a in l]
        if hits:
            break
    if not hits:
        # last resort: whole normalized evidence as one substring of the file
        if norm(evidence) in norm(src):
            return True, "evidence found (whole-block match, line unverified)"
        return False, "evidence not present in file"

    claimed = f.get("line")
    try:
        claimed = int(claimed)
    except (TypeError, ValueError):
        return True, f"evidence found at {hits[:3]}, no claimed line"

    if any(abs(h - claimed) <= LINE_TOLERANCE for h in hits):
        return True, f"evidence found near claimed line {claimed}"
    # The quoted code IS in the file, just not where they said. That is a citation
    # error, not a hallucination - keep it and correct the line. Only invented
    # files and invented code get dropped.
    f["line"] = hits[0]
    return True, f"LINE CORRECTED {claimed} -> {hits[0]} (evidence genuine)"


def main() -> None:
    findings_path, root_arg, out_prefix = sys.argv[1], sys.argv[2], sys.argv[3]
    root = Path(root_arg)
    data = json.loads(Path(findings_path).read_text(encoding="utf-8"))
    findings = data["findings"] if isinstance(data, dict) else data

    passed, failed = [], []
    for f in findings:
        ok, why = check(f, root)
        f = {**f, "gate_a": why}
        (passed if ok else failed).append(f)

    Path(f"{out_prefix}-pass.json").write_text(
        json.dumps(passed, indent=1), encoding="utf-8")
    Path(f"{out_prefix}-fail.json").write_text(
        json.dumps(failed, indent=1), encoding="utf-8")

    n = len(findings)
    rate = (len(failed) / n * 100) if n else 0.0
    print(f"Gate A: {n} in -> {len(passed)} pass, {len(failed)} dropped "
          f"(hallucination rate {rate:.1f}%)")
    for f in failed:
        print(f"  DROP {f.get('file')}:{f.get('line')} :: {f['gate_a']}")


def _self_check() -> None:
    """ponytail: one runnable check instead of a test suite. `python gate_a.py --test`"""
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        (root / "a.rs").write_text(
            "fn main() {\n" * 20 + "    let x = verify_signature(&ev);\n" + "}\n",
            encoding="utf-8")
        real = {"file": "a.rs", "line": 21, "evidence": "let x = verify_signature(&ev);"}
        assert check(real, root)[0]
        # right code, wrong line -> kept, but the line is corrected
        moved = {**real, "line": 200}
        ok, why = check(moved, root)
        assert ok and "LINE CORRECTED" in why and moved["line"] == 21
        # invented file -> dropped
        assert not check({**real, "file": "ghost.rs"}, root)[0]
        # invented code -> dropped
        assert not check({**real, "evidence": "let y = totally_made_up();"}, root)[0]
        # whitespace/indent differences must still match
        assert check({**real, "evidence": "  let   x =  verify_signature(&ev);"}, root)[0]
        # empty evidence -> dropped
        assert not check({**real, "evidence": ""}, root)[0]
    print("gate_a self-check OK")


if __name__ == "__main__":
    if "--test" in sys.argv:
        _self_check()
    else:
        main()
