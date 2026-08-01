"""Render the audit advisory to a self-contained HTML page in the repo's house style.

ponytail: steals the <style> block from hardening.html rather than defining a second
theme. If the house style changes there, re-run this.
"""
import re
import sys
from pathlib import Path

import markdown

REPO = Path(r"C:\Users\simon\Downloads\buzz_me\buzz-tutorial")
SRC = REPO / "audit" / "buzz-audit-advisory.md"
OUT = REPO / "audit" / "advisory.html"
STYLE_DONOR = REPO / "hardening.html"

TITLE = "buzz — security and quality audit advisory"
SUB = ("27 confirmed findings: 4 high, 12 medium, 11 low. No critical survived "
       "verification. Claude-verified only — the independent second-model gate never ran.")

EXTRA_CSS = """
/* advisory-specific */
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
        cls = sev.lower()
        return (f'<h3{attrs}>{fid}'
                f'<span class="sevtag sev-{cls}">{sev.lower()}</span> '
                f'<span style="color:var(--muted)">—</span> {rest}</h3>')
    return re.sub(
        r'<h3([^>]*)>(F\d+)\s*—\s*(HIGH|MEDIUM|LOW)\s*—\s*(.*?)</h3>',
        repl, html)


def main() -> None:
    md = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "sane_lists"],
                           extension_configs={"toc": {"permalink": False,
                                                      "toc_depth": "2-3"}})
    body = md.convert(SRC.read_text(encoding="utf-8"))
    body = severity_badges(body)
    # first <h1> becomes the hero; drop it from the flow
    body = re.sub(r"<h1[^>]*>.*?</h1>", "", body, count=1, flags=re.S)
    body = body.replace("<table>", '<div class="tablewrap"><table>')
    body = body.replace("</table>", "</table></div>")

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{TITLE}</title>
<style>{house_style()}{EXTRA_CSS}</style>
</head>
<body>
<div class="wrap">
<header class="hero">
<h1>{TITLE}</h1>
<p class="sub">{SUB}</p>
</header>
<nav class="toc">
<strong>Contents</strong>
{md.toc}
</nav>
{body}
<hr>
<p class="backlink"><a href="../">← buzz-tutorial</a> ·
<a href="buzz-audit-advisory.md">markdown source</a> ·
<a href="graph/graph.html">knowledge graph</a></p>
</div>
</body>
</html>
"""
    OUT.write_text(page, encoding="utf-8")
    print(f"wrote {OUT}  {OUT.stat().st_size:,} bytes")

    # ponytail: one check that fails loudly if the render silently drops content
    out = OUT.read_text(encoding="utf-8")
    for probe in ["F009", "F014", "F015", "F023", "F048", "audio/handler.rs",
                  "Coverage gaps", "sev-high"]:
        assert probe in out, f"missing from render: {probe}"
    assert out.count('class="sevtag') == 27, \
        f'expected 27 severity badges, got {out.count(chr(34)+"sevtag")}'
    print("checks passed: 27 findings rendered")


if __name__ == "__main__":
    main()
