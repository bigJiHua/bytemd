import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const directory = new URL('./test/', import.meta.url)
const files = readdirSync(directory)
  .filter((file) => file.endsWith('.test.mjs'))
  .sort()
const result = spawnSync(
  process.execPath,
  ['--test', ...files.map((file) => fileURLToPath(new URL(file, directory)))],
  { stdio: 'inherit' },
)
if (result.error) console.error(result.error)
process.exitCode = result.status ?? 1
