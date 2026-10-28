import fs from 'node:fs'

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  return sorted.length
    ? Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100
    : null
}
const args = process.argv.slice(2)
const destination = args.find((arg) => arg.startsWith('--out='))?.slice(6)
const summaries = args
  .filter((arg) => !arg.startsWith('--out='))
  .map((path) => {
    const data = JSON.parse(fs.readFileSync(path, 'utf8'))
    const groups = new Map()
    for (const result of data.results) {
      if (
        !['mount', 'api-edit', 'keyboard-burst', 'plugins-only'].includes(
          result.operation,
        )
      )
        continue
      const key = `${result.profile}/${result.kib}/${result.operation}`
      const rows = groups.get(key) ?? []
      rows.push(result)
      groups.set(key, rows)
    }
    const rows = [...groups].map(([key, samples]) => ({
      key,
      samples: samples.length,
      endToEndMs: median(samples.map((x) => x.endToEndMs)),
      firstFrameMs: median(samples.map((x) => x.firstFrameMs)),
      parseMs: median(
        samples.map((x) => x.renders.reduce((n, r) => n + r.parseMs, 0)),
      ),
      transformMs: median(
        samples.map((x) => x.renders.reduce((n, r) => n + r.transformMs, 0)),
      ),
      stringifyMs: median(
        samples.map((x) => x.renders.reduce((n, r) => n + r.stringifyMs, 0)),
      ),
      domAndCopyMs: median(
        samples.map((x) => x.renders.reduce((n, r) => n + r.domAndCopyMs, 0)),
      ),
      forcedLayoutMs: median(
        samples.map((x) => x.renders.reduce((n, r) => n + r.forcedLayoutMs, 0)),
      ),
      pluginsSettleMs: median(
        samples.map((x) => x.renders.at(-1)?.pluginsSettleMs),
      ),
      maxLongTaskMs: median(samples.map((x) => x.maxLongTaskMs)),
      worstLongTaskMs: Math.max(...samples.map((x) => x.maxLongTaskMs)),
      totalBlockingMs: median(samples.map((x) => x.totalBlockingMs)),
      previewNodes: median(samples.map((x) => x.previewNodes)),
      heapReadyMiB: median(
        samples.map((x) =>
          x.heapReady === null ? null : x.heapReady / 1024 ** 2,
        ),
      ),
      errors: samples.flatMap((x) => x.errors),
      remainingDomAfterDestroy: samples
        .map((x) => x.domNodesAfterDestroy)
        .filter((x) => x !== undefined),
    }))
    return { path, label: data.label, environment: data.environment, rows }
  })
const json = JSON.stringify(summaries, null, 2) + '\n'
if (destination) {
  fs.writeFileSync(destination, json)
  console.log(`Wrote ${destination}`)
} else console.log(json)
