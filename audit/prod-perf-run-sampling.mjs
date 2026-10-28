// Backward-compatible entry point; all startup/cleanup now belongs to reproduce.
import { reproduce, cliOptions } from './prod-perf-reproduce.mjs'

reproduce(cliOptions()).then((report) => {
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.errors.length ? 1 : 0
})
