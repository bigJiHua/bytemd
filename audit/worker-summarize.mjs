import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const raw = JSON.parse(
  await fs.readFile(
    new URL('./worker-performance-results.json', import.meta.url),
    'utf8',
  ),
)
const groups = new Map()
for (const result of raw.results.filter((r) => r.operation !== 'ui-fixture')) {
  assert.equal(result.errors.length, 0)
  assert.equal(result.metadataKept, true)
  for (const key of ['highlight', 'math', 'mermaid'])
    assert.equal(result.counts[key], result.expected[key])
  assert.equal(result.render.mode, result.mode)
  const key = [result.profile, result.kib, result.operation, result.mode].join(
    '/',
  )
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(result)
}
const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return (
    Math.round(
      (sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2) * 100,
    ) / 100
  )
}
const summary = [...groups].map(([group, samples]) => ({
  group,
  samples: samples.length,
  ...Object.fromEntries(
    [
      'firstFrameMs',
      'frameMaxGapMs',
      'maxLongTaskMs',
      'blockingMs',
      'totalMs',
      'domAndCopyMs',
    ].map((key) => [key, median(samples.map((s) => s[key]))]),
  ),
  renderMs: median(samples.map((s) => s.render.renderMs)),
}))
const report = {
  schema: 1,
  source: 'worker-performance-results.json',
  sampleCount: [...groups.values()].reduce(
    (n, samples) => n + samples.length,
    0,
  ),
  scope:
    '100 KiB core real-key has three samples per mode; all other groups have one sample. No p95 claim or steady-state total-speed attribution.',
  summary,
}
await fs.writeFile(
  new URL('./worker-performance-summary.json', import.meta.url),
  JSON.stringify(report, null, 2),
)
console.log(JSON.stringify(report))
