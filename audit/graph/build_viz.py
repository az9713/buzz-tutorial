"""Slim graph.json -> self-contained graph.html (force-graph, Obsidian-style)."""
import json

g = json.load(open('graph.json', encoding='utf-8'))
ids = {n['id'] for n in g['nodes']}
deg = {}
links = []
for l in g['links']:
    s, t = l['source'], l['target']
    if s in ids and t in ids:
        links.append({'s': s, 't': t})
        deg[s] = deg.get(s, 0) + 1
        deg[t] = deg.get(t, 0) + 1

nodes = [{'id': n['id'], 'label': n['label'], 'c': int(n.get('community') or 0),
          'd': deg.get(n['id'], 0)} for n in g['nodes']]

# default degree threshold: largest view under ~2500 nodes
thr = 0
for d in range(0, 201):
    if sum(1 for n in nodes if n['d'] >= d) <= 2500:
        thr = d
        break

data = json.dumps({'nodes': nodes, 'links': links},
                  separators=(',', ':')).replace('</', '<\\/')

lib = open('force-graph.min.js', encoding='utf-8').read().replace('</', '<\\/')
html = open('graph_template.html', encoding='utf-8').read()
html = html.replace('__DATA__', data).replace('__THR__', str(thr)).replace('__LIB__', lib)
open('graph.html', 'w', encoding='utf-8').write(html)
print(f'graph.html written: {len(nodes)} nodes, {len(links)} links, default degree >= {thr}')
