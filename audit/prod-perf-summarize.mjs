import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const distribution = (values) => {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!finite.length) return null
  const middle = Math.floor(finite.length / 2)
  return {
    n: finite.length,
    min: finite[0],
    median:
      finite.length % 2
        ? finite[middle]
        : (finite[middle - 1] + finite[middle]) / 2,
    max: finite.at(-1),
  }
}

export function summarize(auditDir) {
  const files = readdirSync(auditDir)
  const read = (filename) =>
    JSON.parse(readFileSync(join(auditDir, filename), 'utf8'))
  const groups = new Map()
  for (const filename of files.filter((name) =>
    /^prod-perf-\d+kib-(worker|sync)-(core|enhanced)-\d+\.json$/.test(name)
  )) {
    const record = read(filename)
    const key = `${record.size}/${record.mode}/${record.profile}`
    if (!groups.has(key))
      groups.set(key, {
        size: record.size,
        mode: record.mode,
        profile: record.profile,
        records: [],
      })
    groups.get(key).records.push(record)
  }
  const performance = [...groups.values()].map(({ records, ...group }) => {
    const samples = records.map((record) => record.sample)
    const metrics = Object.fromEntries(
      [
        'firstFrameMs',
        'frameMaxGapMs',
        'totalMs',
        'lastKeyToPreviewMs',
        'maxLongTaskMs',
        'blockingMs',
      ].map((metric) => [
        metric,
        distribution(samples.map((sample) => sample[metric])),
      ])
    )
    const costs = Object.fromEntries(
      [
        ...new Set(samples.flatMap((sample) => Object.keys(sample.costMarks))),
      ].map((cost) => [
        cost,
        distribution(samples.map((sample) => sample.costMarks[cost])),
      ])
    )
    return {
      ...group,
      validSamples: samples.length,
      minimumMet: samples.length >= 3,
      metrics,
      costs,
    }
  })
  const memory = files
    .filter((name) => /^heap-counters-loop\d+\.json$/.test(name))
    .map((filename) => {
      const record = read(filename),
        after = record.phases['after-destroy']
      return {
        loop: record.loop,
        delta: record.afterDestroyMinusBefore,
        afterDestroy: after.counters,
        immediateAfterDestroy: after.immediateAfterDestroy,
        settledMs: after.settledMs,
        devtoolsConsoleCleared: after.devtoolsConsoleCleared,
        measuredDomNodes: after.page.domNodes,
        snapshots: Object.values(record.phases).map(
          (phase) => phase.snapshot.filename
        ),
      }
    })
  const report = read('prod-perf-summary.json')
  const comparisons = new Map()
  for (const record of report.comparison ?? []) {
    const key = `${record.size}/${record.profile}/${record.variant}`
    if (!comparisons.has(key))
      comparisons.set(key, {
        size: record.size,
        profile: record.profile,
        variant: record.variant,
        samples: [],
      })
    comparisons.get(key).samples.push(record.sample)
  }
  return {
    schema: 2,
    auditDir: resolve(auditDir),
    performance,
    memory,
    composition: report.composition,
    comparison: report.comparison
      ? [...comparisons.values()].map(({ samples, ...group }) => ({
          ...group,
          firstFrameMs: distribution(
            samples.map((sample) => sample.firstFrameMs)
          ),
          totalMs: distribution(samples.map((sample) => sample.totalMs)),
        }))
      : null,
    mobile: report.mobile,
    interaction: report.interaction,
    errors: report.errors,
    notes: [
      'Medians/ranges of three samples are descriptive; they do not establish p95 or a production SLA.',
      'Worker round trip contains parsing, queue/startup and serialization; overhead is a residual, not isolated transport latency.',
      'DOM commit/copy and initial forced layout are separate from asynchronous plugin completion; costs are not an additive exhaustive decomposition.',
      'CodeMirror first update is keydown-to-first-update observation, including synchronous host callbacks; RAF is not OS presentation latency.',
      'Memory clears DevTools console roots, forces GC and documents settling time. Zero node/listener growth in these cycles is not proof of no leaks.',
      'automated-cdp composition is distinct from real OS input-method verification; real mobile verification remains incomplete.',
    ],
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(summarize(process.argv[2]), null, 2))
