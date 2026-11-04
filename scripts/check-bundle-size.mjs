import { rootDir } from './utils.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

// Enforce the existing bundlewatch gzip budgets without contacting reporting
// services. The configured production files are exact paths, not glob patterns.
const manifest = JSON.parse(
  await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'),
)
const checks = []
for (const { path: filename, maxSize } of manifest.bundlewatch.files) {
  const match = /^(\d+(?:\.\d+)?)\s*(B|KB|MB)$/i.exec(maxSize)
  assert.ok(match, `Unsupported size budget: ${maxSize}`)
  const unit = { b: 1, kb: 1024, mb: 1024 * 1024 }[match[2].toLowerCase()]
  const maximum = Number(match[1]) * unit
  const size = gzipSync(await fs.readFile(path.join(rootDir, filename)), {
    level: 9,
  }).length
  const passed = size <= maximum
  checks.push({ filename, compression: 'gzip', size, maximum, passed })
  if (!passed) process.exitCode = 1
}
console.log(JSON.stringify(checks, null, 2))
