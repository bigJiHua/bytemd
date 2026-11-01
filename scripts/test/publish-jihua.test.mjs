import { mapPackageName, rewriteManifest, rootDir } from '../publish-jihua.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('mapPackageName maps the bytemd family and leaves third parties alone', () => {
  assert.equal(mapPackageName('bytemd'), '@jihua/bytemd')
  assert.equal(mapPackageName('@bytemd/vue-next'), '@jihua/bytemd-vue-next')
  assert.equal(mapPackageName('@bytemd/plugin-gfm'), '@jihua/bytemd-plugin-gfm')
  assert.equal(mapPackageName('remark-gfm'), 'remark-gfm')
  assert.equal(mapPackageName('vue'), 'vue')
})

test('rewriteManifest resolves workspace protocol like pnpm publish would', () => {
  const versions = { bytemd: '1.22.0' }
  const rewritten = rewriteManifest(
    {
      name: '@bytemd/vue-next',
      version: '1.22.1',
      dependencies: { bytemd: 'workspace:*' },
      peerDependencies: { vue: '^3.0.0' },
    },
    versions,
  )
  assert.equal(rewritten.name, '@jihua/bytemd-vue-next')
  assert.deepEqual(rewritten.dependencies, { '@jihua/bytemd': '1.22.0' })
  assert.deepEqual(rewritten.peerDependencies, { vue: '^3.0.0' })
})

test('rewriteManifest keeps caret/tilde prefixes and rewrites devDependencies', () => {
  const versions = { bytemd: '1.22.0' }
  const rewritten = rewriteManifest(
    {
      name: '@bytemd/plugin-gfm',
      dependencies: { 'remark-gfm': '^4.0.1' },
      devDependencies: { bytemd: 'workspace:^' },
    },
    versions,
  )
  assert.deepEqual(rewritten.dependencies, { 'remark-gfm': '^4.0.1' })
  assert.deepEqual(rewritten.devDependencies, { '@jihua/bytemd': '^1.22.0' })
})

test('rewriteManifest rejects workspace deps pointing outside the workspace', () => {
  assert.throws(() =>
    rewriteManifest({ name: 'x', dependencies: { bytemd: 'workspace:*' } }, {}),
  )
})

test('real manifests of this repo rewrite cleanly against current versions', () => {
  const packagesDir = path.join(rootDir, 'packages')
  const versions = {}
  for (const entry of fs.readdirSync(packagesDir)) {
    const file = path.join(packagesDir, entry, 'package.json')
    if (fs.existsSync(file))
      versions[JSON.parse(fs.readFileSync(file, 'utf8')).name] = JSON.parse(
        fs.readFileSync(file, 'utf8'),
      ).version
  }
  const vueNext = JSON.parse(
    fs.readFileSync(path.join(packagesDir, 'vue-next', 'package.json'), 'utf8'),
  )
  const rewritten = rewriteManifest(vueNext, versions)
  assert.equal(rewritten.name, '@jihua/bytemd-vue-next')
  assert.equal(rewritten.dependencies['@jihua/bytemd'], versions.bytemd)
  assert.ok(!JSON.stringify(rewritten).includes('workspace:'))
  assert.equal(rewritten.author, vueNext.author)
  assert.equal(rewritten.license, vueNext.license)
})

test('mapPackageName maps target args given in either spelling', () => {
  const targets = ['@bytemd/vue', '@jihua/bytemd-vue-next'].map(mapPackageName)
  assert.deepEqual(targets, ['@jihua/bytemd-vue', '@jihua/bytemd-vue-next'])
})
