import { getProcessor } from '../packages/bytemd/dist/index.mjs'
import fs from 'node:fs'
import os from 'node:os'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const results = []
const unit =
  '# Title\n\nParagraph with **bold**, `code`, [link](https://example.invalid), [size=20]large[/size] and [color=#123456]color[/color].\n\n'
const measure = (label, markdown, reuse = false, iterations = 3) => {
  const processor = reuse ? getProcessor({}) : undefined
  const timings = []
  let outputBytes = 0
  let error
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    try {
      const html = String((processor ?? getProcessor({})).processSync(markdown))
      outputBytes = Buffer.byteLength(html)
    } catch (cause) {
      error = String(cause)
    }
    timings.push(performance.now() - start)
    if (error) break
  }
  const sorted = [...timings].sort((a, b) => a - b)
  const result = {
    label,
    inputBytes: Buffer.byteLength(markdown),
    outputBytes,
    reuse,
    timingsMs: timings.map((n) => +n.toFixed(2)),
    medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
    ...(error ? { error } : {}),
  }
  results.push(result)
  console.log(JSON.stringify(result))
}

getProcessor({}).processSync(unit.repeat(5))
for (const kib of [10, 100, 500]) {
  const input = unit.repeat(Math.ceil((kib * 1024) / Buffer.byteLength(unit)))
  measure(`${kib} KiB, fresh processor`, input)
  measure(`${kib} KiB, reused processor`, input, true)
}
for (const depth of [64, 256, 1024, 4096]) {
  measure(
    `nested inline size, depth ${depth}`,
    '[size=20]'.repeat(depth) + 'text' + '[/size]'.repeat(depth),
    false,
    1
  )
}
const artifact = {
  date: '2026-10-25',
  node: process.version,
  platform: process.platform,
  cpu: os.cpus()[0]?.model,
  scope:
    'Synchronous Markdown-to-HTML only; no browser DOM, layout, plugin highlight/KaTeX/Mermaid.',
  results,
}
fs.writeFileSync(
  process.argv[2] ??
    fileURLToPath(new URL('./benchmark-results.json', import.meta.url)),
  JSON.stringify(artifact, null, 2) + '\n'
)
