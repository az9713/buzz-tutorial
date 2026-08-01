"""Render the audit markdown documents to self-contained HTML in the repo's house style.

Run from anywhere: `python audit/data/md2html.py`

ponytail: steals the <style> block from hardening.html rather than defining a second
theme. If the house style changes there, re-run this.
"""
import re
import sys
from pathlib import Path

import markdown

REPO = Path(__file__).resolve().parents[2]
AUDIT = REPO / "audit"
STYLE_DONOR = REPO / "hardening.html"

# src, out, title, subtitle, probes that must survive the render
DOCS = [
    ("buzz-audit-advisory.md", "advisory.html",
     "buzz — security and quality audit advisory",
     "27 confirmed findings: 4 high, 12 medium, 11 low. No critical survived "
     "verification. Claude-verified only — the independent second-model gate never ran.",
     ["F009", "F014", "F015", "F023", "F048", "audio/handler.rs", "Coverage gaps"]),
    ("buzz-blindspots.md", "blindspots.html",
     "Blindspot pass: the technical creation of Buzz",
     "What the architecture explainers leave out. Claims marked [verified] were "
     "re-checked directly against the clone at main @ 10d5a2641.",
     ["[verified]", "Buzz"]),
    ("managed-agents-deep-dive.md", "managed-agents.html",
     "managed_agents — the directory the audit never read",
     "12 findings over 77 Rust files with no lint coverage: prompt injection and "
     "confused deputy, plus unsafe and process control. Claude-verified only.",
     ["runtime/process.rs:63-66", "BUZZ_PRIVATE_KEY", "personaCatalogRelay.ts",
      "TeamSnapshotMemberPreview", "Coverage — read vs skipped"]),
    ("audit-phase0-log.md", "phase0-log.html",
     "Phase 0 log — cartography, tooling, and calibration setup",
     "The raw record behind the advisory: tooling, the knowledge graph, the slice "
     "list, and two corrections made mid-run. Target: buzz/ @ b1b283cd4.",
     ["Skill search", "b1b283cd4"]),
]

EXTRA_CSS = """
/* audit-doc additions */
.sevtag{display:inline-block;font:600 .68rem/1 ui-sans-serif,system-ui,sans-serif;
  text-transform:uppercase;letter-spacing:.06em;padding:.28em .5em;border-radius:3px;
  vertical-align:.12em;margin-left:.5em}
.sev-high{background:rgba(138,61,18,.13);color:var(--warn)}
.sev-medium{background:rgba(168,98,13,.13);color:var(--accent)}
.sev-low{background:rgba(45,106,62,.13);color:var(--ok)}
blockquote{margin:1.1rem 0;padding:.1rem 0 .1rem 16px;border-left:3px solid var(--rule);
  color:var(--muted);font-size:.95rem}
h3 code{font-size:.82em;background:none;padding:0;color:var(--muted)}
.backlink{font-family:ui-sans-serif,system-ui,sans-serif;font-size:.85rem}
"""

NAV = """<hr>
<p class="backlink"><a href="../">← buzz-tutorial</a> ·
<a href="advisory.html">advisory</a> ·
<a href="blindspots.html">blindspots</a> ·
<a href="managed-agents.html">managed_agents</a> ·
<a href="phase0-log.html">phase 0 log</a> ·
<a href="graph/graph.html">knowledge graph</a></p>"""


def house_style() -> str:
    html = STYLE_DONOR.read_text(encoding="utf-8", errors="replace")
    m = re.search(r"<style>(.*?)</style>", html, re.S)
    if not m:
        sys.exit("no <style> block in hardening.html — house style moved")
    return m.group(1)


def severity_badges(html: str) -> str:
    """Turn '### F009 — HIGH — `path`' headings into a badge + monospace path."""
    def repl(m):
        attrs, fid, sev, rest = m.group(1), m.group(2), m.group(3), m.group(4)
        return (f'<h3{attrs}>{fid}'
                f'<span class="sevtag sev-{sev.lower()}">{sev.lower()}</span> '
                f'<span style="color:var(--muted)">—</span> {rest}</h3>')
    return re.sub(r'<h3([^>]*)>(F\d+)\s*—\s*(HIGH|MEDIUM|LOW)\s*—\s*(.*?)</h3>',
                  repl, html)


def render(src: str, out: str, title: str, sub: str, probes: list, style: str) -> None:
    md = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "sane_lists"],
                           extension_configs={"toc": {"permalink": False,
                                                      "toc_depth": "2-3"}})
    body = md.convert((AUDIT / src).read_text(encoding="utf-8"))
    body = severity_badges(body)
    # the first <h1> becomes the hero, so drop it from the flow
    body = re.sub(r"<h1[^>]*>.*?</h1>", "", body, count=1, flags=re.S)
    body = body.replace("<table>", '<div class="tablewrap"><table>')
    body = body.replace("</table>", "</table></div>")

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>{style}{EXTRA_CSS}</style>
</head>
<body>
<div class="wrap">
<header class="hero">
<h1>{title}</h1>
<p class="sub">{sub}</p>
</header>
<nav class="toc">
<strong>Contents</strong>
{md.toc}
</nav>
{body}
{NAV}
</div>
</body>
</html>
"""
    dst = AUDIT / out
    dst.write_text(page, encoding="utf-8")

    # ponytail: one check that fails loudly if a render silently drops content
    written = dst.read_text(encoding="utf-8")
    for probe in probes:
        assert probe in written, f"{out}: missing from render: {probe}"
    assert "<h2" in written, f"{out}: no sections rendered"
    if out == "advisory.html":
        n = written.count('class="sevtag')
        assert n == 27, f"expected 27 severity badges, got {n}"
    print(f"wrote {dst.name:18} {dst.stat().st_size:>9,} bytes   checks passed")


def main() -> None:
    style = house_style()
    for doc in DOCS:
        render(*doc, style=style)


if __name__ == "__main__":
    main()
