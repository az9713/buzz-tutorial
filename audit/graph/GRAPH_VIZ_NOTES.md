# Interactive Graph Visualization — Brainstorm Notes

Date: 2026-07-31
Status: **decided, not yet built** — plan approved verbally, no code written or run.

## Goal

An Obsidian-style interactive view of `graph.json`:

- drag nodes, pan, scroll-zoom
- **when dragging a node, its neighbors follow along with a springy "lag"**
- color clusters, hover labels, search
- ideally a single double-clickable HTML file, no server, no install

## The data

`graph.json` (26 MB) — node-link JSON exported by graphify:

- **20,140 nodes**: `{label, file_type, source_file, source_location, id, community, norm_label}`
- **53,273 links**: `{relation, confidence, source_file, source_location, weight, source, target, confidence_score}`
- 0 hyperedges
- Every node already carries a `community` id → free Obsidian-style cluster coloring.
- Most of the 26 MB is provenance metadata; slimmed to `{id, label, community, degree}` + `{source, target}` the payload drops to ~2–4 MB, small enough to embed in the HTML.

## Key insight: "drag-lag" is not a feature, it's physics

Neighbors following a dragged node with lag is an **emergent property of any live
force simulation**, not something to implement:

1. Links are springs; nodes repel (charge force); everything is velocity-damped.
2. On drag, the dragged node is pinned to the cursor and the simulation is re-heated.
3. Spring forces pull neighbors after the pinned node; velocity decay *is* the lag.

Obsidian works exactly this way. So the requirement reduces to: pick a library
whose drag handler keeps the simulation running. No wheel-reinventing needed.

## How Obsidian implements its graph view (for reference)

- Rendering: **Pixi.js** (WebGL) — why it stays smooth at thousands of nodes.
- Layout: custom d3-force-style simulation compiled to **WebAssembly**
  (link springs + charge repulsion + centering).
- Interaction: fix node to pointer on drag, re-heat sim, springs do the rest.
- The graph view itself is closed-source, but the recipe is fully reproducible
  with open libraries.

## Options considered

| Library | Renderer | Drag-lag out of the box | Scale @ 20k nodes | Verdict |
|---|---|---|---|---|
| **force-graph** (vasturiano) | Canvas 2D, d3-force inside | **Yes** — drag re-heats sim by default | OK (with degree filter for comfort) | **Chosen** |
| sigma.js + graphology | WebGL, ForceAtlas2 | No — needs manual glue between drag and a live layout worker | Best raw performance | Rejected: more setup for the same feel |
| vis-network | Canvas, own physics | Yes, by default, least code | Chokes well below 20k | Rejected: can't handle the dataset |
| Cosmograph / cosmos | GPU (WebGL) | No — built for layout/exploration, not springy per-node drag | Millions of nodes | Rejected: wrong interaction model |
| Raw d3-force + hand-rolled canvas | Canvas 2D | Yes, ~30 lines of glue | Same as force-graph | Rejected: force-graph *is* this, prepackaged |

## Why force-graph won

- **Exact target behavior for free**: dragging pins the node and re-heats the
  d3-force simulation by default → neighbors follow with the Obsidian lag,
  zero extra code.
- **Zero-friction ship**: one `<script>` tag from CDN, no build step, no server —
  fits the single-HTML-file goal.
- **Everything else built in**: pan/zoom, hover, node canvas customization
  (community colors, size-by-degree, labels).
- **Adequate scale**: 20k nodes / 53k links is within canvas range; a
  degree-threshold slider (default filtered, full graph one drag away — the same
  trick Obsidian's filters use) keeps the initial view smooth. If it ever feels
  slow, sigma.js is the escape hatch; 3d-force-graph (same author, same API) is
  the 3D upgrade path.

## Agreed build plan (when green-lit)

1. Small Python script: slim `graph.json` → minimal node/link JS payload
   (`{id, label, community, degree}`, `{source, target}`).
2. One self-contained `graph.html`: force-graph on canvas, embedded data,
   community colors, size-by-degree, hover-highlight neighbors, search box,
   degree-threshold slider.
3. Optional: inline the force-graph lib (~few hundred KB) instead of CDN for
   fully offline use.
