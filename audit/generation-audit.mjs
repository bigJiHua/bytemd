import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const [operation, label, other] = process.argv.slice(2)
if (
  !['sources', 'outputs', 'compare'].includes(operation) ||
  !/^[a-z0-9-]+$/.test(label ?? '') ||
  (other && !/^[a-z0-9-]+$/.test(other))
)
  throw new Error(
    'Usage: generation-audit.mjs sources|outputs NAME; compare BEFORE AFTER',
  )
const artifact = (name) => new URL(`./generation-${name}.json`, import.meta.url)
if (operation === 'compare') {
  const before = JSON.parse(await fs.readFile(artifact(label), 'utf8'))
  const after = JSON.parse(await fs.readFile(artifact(other), 'utf8'))
  const keys = [
    ...new Set([...Object.keys(before.files), ...Object.keys(after.files)]),
  ].sort()
  const changed = keys.filter(
    (key) =>
      JSON.stringify(before.files[key]) !== JSON.stringify(after.files[key]),
  )
  const result = {
    before: label,
    after: other,
    checkedFiles: keys.length,
    changed,
  }
  await fs.writeFile(
    artifact(`${label}-vs-${other}`),
    JSON.stringify(result, null, 2),
  )
  console.log(JSON.stringify(result))
  assert.deepEqual(changed, [])
} else {
  const files = {}
  const scan = async (relative) => {
    const absolute = path.join(root, relative)
    let stat
    try {
      stat = await fs.lstat(absolute)
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    if (stat.isSymbolicLink())
      files[relative] = { type: 'link', target: await fs.readlink(absolute) }
    else if (stat.isDirectory()) {
      for (const name of (await fs.readdir(absolute)).sort())
        await scan(`${relative}/${name}`)
    } else
      files[relative] = {
        type: 'file',
        sha256: crypto
          .createHash('sha256')
          .update(await fs.readFile(absolute))
          .digest('hex'),
      }
  }
  if (operation === 'sources') {
    for (const name of [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      'tsconfig-base.json',
      'README.md',
      'docs',
      'scripts',
      '.github',
      'playground/package.json',
      'playground/vite.config.mjs',
      'playground/src',
    ])
      await scan(name)
  }
  for (const directory of (
    await fs.readdir(path.join(root, 'packages'), { withFileTypes: true })
  )
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()) {
    for (const name of operation === 'outputs'
      ? ['dist', 'svelte', 'LICENSE']
      : [
          'package.json',
          'tsconfig.json',
          'tsconfig.svelte.json',
          'src',
          'locales',
          'test',
          'README.md',
          'LICENSE',
        ])
      await scan(`packages/${directory}/${name}`)
  }
  await fs.writeFile(
    artifact(label),
    JSON.stringify({ operation, files }, null, 2),
  )
  console.log(JSON.stringify({ label, files: Object.keys(files).length }))
}
