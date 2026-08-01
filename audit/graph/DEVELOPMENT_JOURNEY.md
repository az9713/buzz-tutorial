# Development Journey — Interactive Knowledge-Graph Viewer

Date: 2026-07-31
Companion doc: [GRAPH_VIZ_NOTES.md](GRAPH_VIZ_NOTES.md) (the original brainstorm — options
table and the full rationale for choosing force-graph). This doc is the story of how the
final `graph.html` came to be, plus the things about the build you didn't ask about but
should know.

## Tech stack (final)

| Layer | Choice | Why |
|---|---|---|
| Data source | `graph.json` (graphify export, 26 MB) | 20,140 nodes / 53,273 links, nodes pre-tagged with `community` |
| Build step | `build_viz.py` (Python, stdlib only) | Slims data, computes degrees, picks default filter, injects everything into the template |
| Template | `graph_template.html` | All UI + rendering code lives here — this is the file to edit |
| Rendering/physics | `force-graph` v1.49.5 (vasturiano), Canvas 2D + d3-force | Drag-reheats-simulation behavior built in; one file, no build toolchain |
| Library delivery | `force-graph.min.js` vendored locally, inlined at build time | No CDN, fully offline, no supply-chain exposure |
| Output | `graph.html` (~7.3 MB, single file) | Double-click to open; data + library + UI all embedded |

No npm, no bundler, no server, no framework. The whole "app" is one Python script and one
HTML template.

## How we got here — the back-and-forth

**1. "Can we get an Obsidian-like graph?"** First move was to look at what data existed:
`graph.json` turned out to be a ready-made node-link export with community ids — no
extraction work needed. Initial plan: d3-force on Canvas, slim the data, degree filter
for performance.

**2. "Neighbors should be dragged along with lag."** This question reshaped the project.
The key realization (captured in detail in GRAPH_VIZ_NOTES.md): drag-lag is not a feature
anyone implements — it falls out of any *live* force simulation. Links are springs; pin
the dragged node to the cursor, keep the physics running, and velocity damping *is* the
lag. Obsidian (Pixi.js rendering + a WASM force sim) works exactly this way. So the
question became "which library keeps the simulation alive during drag?", and the answer
narrowed to force-graph — sigma.js needs manual glue, vis-network can't handle 20k nodes,
Cosmograph doesn't do springy per-node drag at all.

**3. "Document the brainstorm."** → GRAPH_VIZ_NOTES.md, including the options table and
the agreed build plan.

**4. "Confirm force-graph really does this."** Verified against the library's own README
rather than memory. The money quote, verbatim: *"every time a node is dragged the
simulation is re-heated so the other nodes react to the changes."* Also confirmed:
pan/zoom, hover callbacks, custom canvas node rendering, and an official ~75k-element
example — comfortably above our size.

**5. Build.** `build_viz.py` + `graph_template.html` → `graph.html`. Verified by actually
opening it in Chrome and screenshotting: 2,450 nodes / 6,232 links visible at the default
filter, clusters colored, UI working.

**6. Mid-build course correction: no CDN.** The first template loaded force-graph from
unpkg with a plain `<script>` tag. A security hook flagged the missing Subresource
Integrity hash (a compromised CDN could inject arbitrary code). Rather than pin a hash,
the simpler fix also bought offline capability: download the library once and inline it
into the HTML at build time. The CDN dependency is gone entirely.

**7. "Do we have a center feature?"** We didn't — `zoomToFit` only ran at load. Added a
**Center** button (600 ms animated fit-to-view, also clears hover highlight), verified by
clicking it in the browser.

**8. "De-clutter the startup text."** Your screenshot showed label soup at startup. Cause:
a rule I'd added that always labeled high-degree nodes regardless of zoom level — but hubs
sit physically close together, so their labels piled up exactly where the graph is densest.
Obsidian shows *no* labels at that altitude. Fix: deleted the rule. Labels now appear only
when zoomed past ~2.2× (fading in) or on hover (hovered node + neighbors). Verified with
a fresh screenshot: clean dots, Obsidian-like.

## Design decisions (and their trade-offs)

- **Canvas 2D, not WebGL.** force-graph's canvas renderer is fast enough at this scale and
  keeps everything in one dependency. WebGL (sigma.js) would be faster raw but costs the
  built-in drag physics. Escape hatch if it ever feels slow.
- **Degree filter as the performance valve.** Default shows only nodes with degree ≥ 10
  (~2,450 nodes). The threshold is *computed at build time*: smallest cutoff that keeps
  the initial view under ~2,500 nodes. Same trick Obsidian's filters use.
- **Community colors via golden-angle hashing.** `hue = community × 137.508° mod 360` —
  deterministic, no palette file, and consecutive community ids land far apart on the
  color wheel so adjacent clusters contrast.
- **Node size = 2 + √degree.** Square root so hubs stand out without dwarfing everything.
- **Slider applies on release, not while dragging.** Rebuilding a 2,000+ node simulation
  on every slider tick would stutter; on-release keeps it responsive.
- **Filter preserves positions.** The same node objects are reused across filter changes,
  so d3-force keeps their x/y — moving the slider refines the current layout instead of
  scrambling it.

## Your unknown unknowns

Things baked into the build that you'd only discover by reading the code (or being bitten):

1. **`graph.html` is generated — never edit it.** Any change goes in
   `graph_template.html` (UI/behavior) or `build_viz.py` (data/threshold), then rerun
   `python build_viz.py`. Direct edits to `graph.html` are overwritten by the next build.
2. **Rebuild after re-running graphify.** `graph.html` embeds a snapshot of `graph.json`.
   If the knowledge graph is regenerated, the viewer is stale until you rerun
   `build_viz.py`.
3. **The layout is not saved.** Every load re-runs the force simulation from random
   positions, so the arrangement differs between sessions (Obsidian recomputes too).
   Node positions you create by dragging are lost on refresh.
4. **Search only sees visible nodes.** The search box queries the *filtered* graph. A
   node hidden by the degree slider won't be found until you lower the threshold. Also,
   degree in "degree ≥ N" means degree in the **full** graph, not the filtered view.
5. **The tab burns CPU while open.** Hover-highlighting requires continuous redraw
   (`autoPauseRedraw(false)`), so the page keeps rendering even when idle. Close the tab
   when not using it; a laptop on battery will notice.
6. **Full-graph mode is heavy.** Slider to 0 = all 20,140 nodes / 53,273 links. It works,
   but the layout churns for a while and interaction gets syrupy. That's physics on 20k
   bodies, not a bug.
7. **Script-injection escaping.** Both the embedded JSON and the inlined library have
   `</` escaped to `<\/`. Without this, any node label containing `</script>` would
   terminate the script block early — a classic single-file-HTML foot-gun. Handled in
   `build_viz.py`; worth knowing if you ever port the build step.
8. **Links with missing endpoints are silently dropped** during the build (there were 0
   this time, but the guard exists). Degree is computed before any filtering.
9. **The browser console shows one `file:` origin warning.** Harmless — a Chrome
   security note about `file://` pages, not an app error.
10. **The slider caps at 50.** Hard-coded range. If a future graph is much denser and you
    want a higher cutoff, change `max` on the `#thr` input in the template.
11. **Verification was visual, not just "it ran".** Each change was confirmed by loading
    the page in Chrome (via DevTools automation) and screenshotting — the startup view,
    the Center button click, and the decluttered restart were all observed, not assumed.

## File inventory

| File | Role | Safe to delete? |
|---|---|---|
| `graph.html` | The viewer (generated) | Yes — regenerate with `build_viz.py` |
| `graph_template.html` | Source of truth for UI/behavior | No |
| `build_viz.py` | Build script | No |
| `force-graph.min.js` | Vendored library v1.49.5 | No (build input) |
| `graph.json` | graphify export (build input) | No |
| `GRAPH_VIZ_NOTES.md` | Brainstorm + options + rationale | Reference |
| `DEVELOPMENT_JOURNEY.md` | This doc | Reference |
