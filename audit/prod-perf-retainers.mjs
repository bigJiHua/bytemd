import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function retainingPaths(
  snapshot,
  pattern = /^<div class="bytemd|^<div class="CodeMirror/,
) {
  const heap = JSON.parse(snapshot.toString())
  const meta = heap.snapshot.meta
  const nf = meta.node_fields,
    ef = meta.edge_fields
  const ns = nf.length,
    es = ef.length,
    count = heap.nodes.length / ns
  const nameOffset = nf.indexOf('name'),
    edgeCountOffset = nf.indexOf('edge_count')
  const toOffset = ef.indexOf('to_node'),
    typeOffset = ef.indexOf('type'),
    edgeNameOffset = ef.indexOf('name_or_index')
  const edgeTypes = meta.edge_types[typeOffset]
  const starts = new Uint32Array(count + 1)
  const parent = new Int32Array(count).fill(-1),
    via = new Uint32Array(count),
    queue = new Uint32Array(count)
  for (let n = 0; n < count; n++)
    starts[n + 1] = starts[n] + heap.nodes[n * ns + edgeCountOffset] * es
  parent[0] = 0
  let read = 0,
    write = 1
  while (read < write) {
    const node = queue[read++]
    for (let e = starts[node]; e < starts[node + 1]; e += es) {
      if (edgeTypes[heap.edges[e + typeOffset]] === 'weak') continue
      const target = heap.edges[e + toOffset] / ns
      if (parent[target] !== -1) continue
      parent[target] = node
      via[target] = e
      queue[write++] = target
    }
  }
  const results = []
  for (let n = 0; n < count && results.length < 10; n++) {
    const name = heap.strings[heap.nodes[n * ns + nameOffset]]
    if (!pattern.test(name) || parent[n] === -1) continue
    const path = []
    for (let current = n; current; current = parent[current]) {
      const e = via[current],
        type = edgeTypes[heap.edges[e + typeOffset]],
        raw = heap.edges[e + edgeNameOffset]
      path.push({
        node: heap.strings[heap.nodes[current * ns + nameOffset]],
        edge: type === 'element' || type === 'hidden' ? raw : heap.strings[raw],
        type,
      })
    }
    results.push({ target: name, path: path.reverse() })
  }
  return results
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(
    JSON.stringify(retainingPaths(readFileSync(process.argv[2])), null, 2),
  )
