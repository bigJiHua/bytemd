import { applyGeneration, planGeneration, replaceRegion } from '../generate.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const region =
  '<!-- bytemd:plugins:start -->\n\nold table\n\n<!-- bytemd:plugins:end -->'
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bytemd-generation-'))
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir())
    await fs.rm(root, { recursive: true })
  })
  const write = async (relative, value) => {
    const destination = path.join(root, relative)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(
      destination,
      typeof value === 'string' ? value : JSON.stringify(value)
    )
  }
  await write('LICENSE', 'MIT license fixture\n')
  await write('tsconfig.json', {
    files: [],
    references: [{ path: 'packages\\bytemd' }, { path: 'custom/project' }],
  })
  await write(
    'README.md',
    `custom introduction\n\n${region}\n\ncustom footer\n`
  )
  await write('docs/index.md', `custom docs\n\n${region}\n`)
  await write('packages/bytemd/README.md', `custom core docs\n\n${region}\n`)
  await write('packages/bytemd/package.json', {
    name: 'bytemd',
    version: '1.22.0',
    repository: { url: 'https://example.com/custom.git' },
    author: 'custom author',
    dependencies: { example: '1.0.0' },
    main: './custom-main.cjs',
    files: ['custom-assets'],
    exports: {
      '.': { import: './custom-main.mjs' },
      './custom': './custom.js',
      './worker': { custom: './worker-custom.js' },
    },
  })
  await write('packages/bytemd/tsconfig.json', {
    extends: '../../custom-base.json',
    include: ['custom-src'],
    exclude: ['custom-exclude'],
    compilerOptions: {
      rootDir: 'custom-src',
      outDir: 'custom-out',
      strict: false,
    },
  })
  await write('packages/plugin-math/package.json', {
    name: '@bytemd/plugin-math',
    description: 'ByteMD plugin to support math formula',
    peerDependencies: { bytemd: '^1.5.0' },
  })
  await write(
    'scripts/plugin-template.md',
    await fs.readFile(new URL('../plugin-template.md', import.meta.url), 'utf8')
  )
  return {
    root,
    write,
    read: (relative) => fs.readFile(path.join(root, relative), 'utf8'),
  }
}

test('generation is read-only while planning and preserves custom config/exports/metadata', async (t) => {
  const f = await fixture(t)
  const config = await f.read('packages/bytemd/tsconfig.json')
  const before = await f.read('packages/bytemd/package.json')
  const plan = await planGeneration(f.root)
  assert.equal(await f.read('packages/bytemd/package.json'), before)
  await applyGeneration(plan)
  const pkg = JSON.parse(await f.read('packages/bytemd/package.json'))
  assert.equal(pkg.main, './custom-main.cjs')
  assert.equal(pkg.exports['.'].import, './custom-main.mjs')
  assert.equal(pkg.exports['./custom'], './custom.js')
  assert.equal(pkg.exports['./worker'].custom, './worker-custom.js')
  assert.equal(pkg.exports['./worker'].import, './dist/worker.mjs')
  assert.equal(Object.keys(pkg.exports['.'])[0], 'types')
  assert.equal(Object.keys(pkg.exports['./worker'])[0], 'types')
  assert.equal(pkg.exports['./processor'].require, './dist/processor.js')
  assert.deepEqual(pkg.dependencies, { example: '1.0.0' })
  assert.equal(pkg.repository.url, 'https://example.com/custom.git')
  assert.equal(pkg.author, 'custom author')
  assert.deepEqual(pkg.files, ['custom-assets', 'dist', 'locales', 'svelte'])
  assert.equal(await f.read('packages/bytemd/tsconfig.json'), config)
  const references = JSON.parse(await f.read('tsconfig.json')).references
  assert.equal(
    references.filter(
      (ref) => ref.path.replace(/\\/g, '/') === 'packages/bytemd'
    ).length,
    1
  )
  assert(references.some((ref) => ref.path === 'custom/project'))
  assert(references.some((ref) => ref.path === 'packages/plugin-math'))
})

test('new plugin README/default config/license are created and a second run changes no bytes', async (t) => {
  const f = await fixture(t)
  await applyGeneration(await planGeneration(f.root))
  const readme = await f.read('packages/plugin-math/README.md')
  assert.match(readme, /import math from '@bytemd\/plugin-math'/)
  assert.match(readme, /import 'katex\/dist\/katex.css'/)
  assert.match(readme, /<!-- bytemd:usage:start -->/)
  assert.equal(
    await f.read('packages/plugin-math/LICENSE'),
    'MIT license fixture\n'
  )
  assert.deepEqual(
    JSON.parse(await f.read('packages/plugin-math/tsconfig.json')).references,
    [{ path: '../bytemd' }]
  )
  const second = await planGeneration(f.root)
  assert.deepEqual(second.changes, [])
  await applyGeneration(second)
  assert.equal(await f.read('packages/plugin-math/README.md'), readme)
})

test('unmarked plugin docs and manual text outside generated regions survive updates', async (t) => {
  const f = await fixture(t)
  const custom =
    '# Custom plugin\n\n## Usage\n\ncustom usage\n\n## Failures\n\ncustom failure contract\n'
  await f.write('packages/plugin-math/README.md', custom)
  await applyGeneration(await planGeneration(f.root))
  assert.equal(await f.read('packages/plugin-math/README.md'), custom)
  const root = await f.read('README.md')
  assert(root.startsWith('custom introduction\n'))
  assert(root.endsWith('custom footer\n'))
  assert.match(root, /Support math formula/)
  await f.write(
    'packages/plugin-math/README.md',
    'custom intro\n\n<!-- bytemd:usage:start -->\n\nold usage\n\n<!-- bytemd:usage:end -->\n\ncustom async failures\n'
  )
  await applyGeneration(await planGeneration(f.root))
  const marked = await f.read('packages/plugin-math/README.md')
  assert(marked.startsWith('custom intro\n'))
  assert(marked.endsWith('custom async failures\n'))
  assert.match(marked, /import math from '@bytemd\/plugin-math'/)
})

test('private plugins are absent from the public table; directories without manifests are ignored', async (t) => {
  const f = await fixture(t)
  await f.write('packages/plugin-secret/package.json', {
    name: '@bytemd/plugin-secret',
    private: true,
  })
  await fs.mkdir(path.join(f.root, 'packages/unmanaged-directory'))
  await applyGeneration(await planGeneration(f.root))
  assert.doesNotMatch(await f.read('README.md'), /plugin-secret/)
  await assert.rejects(f.read('packages/unmanaged-directory/tsconfig.json'), {
    code: 'ENOENT',
  })
})

test('generated usage honors a customized package namespace', async (t) => {
  const f = await fixture(t)
  await f.write('packages/plugin-math/package.json', {
    name: '@custom/math',
    description: 'Custom math parser',
  })
  await applyGeneration(await planGeneration(f.root))
  const readme = await f.read('packages/plugin-math/README.md')
  assert(readme.startsWith('# @custom/math\n'))
  assert.match(readme, /import math from '@custom\/math'/)
  assert.doesNotMatch(readme, /@bytemd\/plugin-math/)
  assert.match(await f.read('README.md'), /\[@custom\/math\]/)
})

test('invalid exports or markers reject the entire plan without writing earlier changes', async (t) => {
  const f = await fixture(t)
  const before = await f.read('packages/bytemd/package.json')
  for (const exports of [
    './custom.js',
    { import: './custom.mjs' },
    { '.': './custom.js', node: './node.js' },
  ]) {
    await f.write('packages/plugin-math/package.json', {
      name: '@bytemd/plugin-math',
      exports,
    })
    await assert.rejects(
      planGeneration(f.root),
      /non-object exports|conditional root exports/
    )
    assert.equal(await f.read('packages/bytemd/package.json'), before)
  }
  await f.write('packages/plugin-math/package.json', {
    name: '@bytemd/plugin-math',
  })
  await f.write(
    'README.md',
    '<!-- bytemd:plugins:start -->\nmissing end marker'
  )
  await assert.rejects(planGeneration(f.root), /Invalid or duplicate/)
  assert.equal(await f.read('packages/bytemd/package.json'), before)
})

test('edits made after planning are detected before any writes', async (t) => {
  const f = await fixture(t)
  const before = await f.read('packages/bytemd/package.json')
  const plan = await planGeneration(f.root)
  await f.write('README.md', 'later manual edit')
  await assert.rejects(applyGeneration(plan), /Changed since planning/)
  assert.equal(await f.read('packages/bytemd/package.json'), before)
  assert.equal(await f.read('README.md'), 'later manual edit')
})

test('region replacement keeps CRLF and rejects duplicate/reversed/orphan markers', () => {
  const source = `intro\r\n\r\n${region.replace(
    /\n/g,
    '\r\n'
  )}\r\n\r\nfooter\r\n`
  const result = replaceRegion(source, 'plugins', 'new\nrows')
  assert.equal(result.replace(/\r\n/g, '').includes('\n'), false)
  assert(result.startsWith('intro\r\n'))
  assert(result.endsWith('footer\r\n'))
  for (const malformed of [
    region + region,
    '<!-- bytemd:plugins:end -->',
    '<!-- bytemd:plugins:end --><!-- bytemd:plugins:start -->',
  ])
    assert.throws(
      () => replaceRegion(malformed, 'plugins', 'x'),
      /Invalid or duplicate/
    )
})

test('a linked documentation parent cannot redirect generation outside the workspace', async (t) => {
  const f = await fixture(t)
  const outside = await fs.mkdtemp(
    path.join(os.tmpdir(), 'bytemd-generation-outside-')
  )
  t.after(() => fs.rm(outside, { recursive: true }))
  await fs.writeFile(path.join(outside, 'index.md'), region)
  await fs.rename(path.join(f.root, 'docs'), path.join(f.root, 'docs-original'))
  await fs.symlink(outside, path.join(f.root, 'docs'), 'junction')
  const before = await f.read('packages/bytemd/package.json')
  await assert.rejects(planGeneration(f.root), /outside workspace/)
  assert.equal(
    await fs.readFile(path.join(outside, 'index.md'), 'utf8'),
    region
  )
  assert.equal(await f.read('packages/bytemd/package.json'), before)
})
