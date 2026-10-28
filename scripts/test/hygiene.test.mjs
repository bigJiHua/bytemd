import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

/** git check-ignore: exit 0 = ignored, 1 = not ignored, other = error. */
const isIgnored = (relative) => {
  try {
    execFileSync('git', ['check-ignore', '-q', relative], {
      cwd: root,
      stdio: 'ignore',
    })
    return true
  } catch (error) {
    if (error.status === 1) return false
    throw error
  }
}

test('audit sampling data is ignored at any directory depth', () => {
  for (const relative of [
    'audit/new-study/summary.json',
    'audit/new-study/probe.ts',
    'audit/new-study/screenshot.png',
    'audit/new-study/suite.test.mjs',
    'audit/prod-perf-demo/data.json',
    'audit/dist-prod-perf/assets/index.js',
  ])
    assert.ok(isIgnored(relative), `expected ignored: ${relative}`)
})

test('audit docs and reproduce scripts stay committable', () => {
  for (const relative of [
    'audit/new-study/notes.md',
    'audit/new-study/repro.mjs',
    'audit/new-study/page.html',
    'audit/new-study/ui.svelte',
    'audit/NOTES.md',
  ])
    assert.ok(!isIgnored(relative), `expected committable: ${relative}`)
})

const mirrors = [
  ...['plugin-gfm', 'plugin-math', 'plugin-mermaid'].map((name) => [
    `packages/${name}/src/locales`,
    `packages/${name}/locales`,
  ]),
  ['packages/plugin-math-ssr/src/locales', 'packages/plugin-math-ssr/locales'],
  ['packages/plugin-math-ssr/locales', 'packages/plugin-math/locales'],
  ['packages/plugin-math-ssr/src/utils', 'packages/plugin-math/src/utils'],
]

test('plugin mirror directories stay byte-identical to their source side', () => {
  for (const [mirror, source] of mirrors) {
    const mirrorFiles = fs.readdirSync(path.join(root, mirror)).sort()
    const sourceFiles = fs.readdirSync(path.join(root, source)).sort()
    assert.deepEqual(
      mirrorFiles,
      sourceFiles,
      `${mirror} file set diverged from ${source}`,
    )
    for (const name of mirrorFiles)
      assert.deepEqual(
        fs.readFileSync(path.join(root, mirror, name)),
        fs.readFileSync(path.join(root, source, name)),
        `${mirror}/${name} diverged from ${source}/${name}`,
      )
  }
})

test('bytemd has no shadow src/locales directory', () => {
  assert.equal(
    fs.existsSync(path.join(root, 'packages/bytemd/src/locales')),
    false,
  )
})
