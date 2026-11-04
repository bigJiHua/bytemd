import { rewriteManifest, rootDir } from './publish-jihua.mjs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { execa } from 'execa'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { svelte2tsx } from 'svelte2tsx'
import ts from 'typescript'
import { build } from 'vite'

// Pack real build outputs and consume their extracted bytes. Dependency links
// use the installed lockfile graph, so this check needs no registry or login.
const output = await fs.mkdtemp(path.join(rootDir, 'audit/prod-perf-packages-'))
const consumer = path.join(output, 'consumer')
const checks = []
const packed = new Map()
const coreManifest = JSON.parse(
  await fs.readFile(path.join(rootDir, 'packages/bytemd/package.json'), 'utf8'),
)
assert.equal(typeof globalThis.document, 'undefined')

async function link(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.symlink(await fs.realpath(source), destination, 'junction')
}

for (const name of ['bytemd', 'react', 'vue', 'vue-next']) {
  const source = path.join(rootDir, 'packages', name)
  const manifest = JSON.parse(
    await fs.readFile(path.join(source, 'package.json'), 'utf8'),
  )
  const rewritten = rewriteManifest(manifest, { bytemd: coreManifest.version })
  const stage = path.join(output, 'staging', name)
  await fs.mkdir(stage, { recursive: true })
  for (const file of [...manifest.files, 'LICENSE']) {
    await fs.cp(path.join(source, file), path.join(stage, file), {
      recursive: true,
    })
  }
  await fs.writeFile(
    path.join(stage, 'package.json'),
    JSON.stringify(rewritten, null, 2),
  )
  const { stdout } = await execa(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', output],
    { cwd: stage },
  )
  const tarball = path.join(output, JSON.parse(stdout)[0].filename)
  const extraction = path.join(output, 'unpacked', name)
  await fs.mkdir(extraction, { recursive: true })
  await execa('tar', ['-xf', tarball, '-C', extraction])
  const directory = path.join(extraction, 'package')
  const actual = JSON.parse(
    await fs.readFile(path.join(directory, 'package.json'), 'utf8'),
  )
  assert.deepEqual(actual, rewritten)
  assert.ok(!JSON.stringify(actual).includes('workspace:'))
  packed.set(name, { directory, source, manifest: actual })
  checks.push({
    package: actual.name,
    tarball: path.basename(tarball),
    packed: true,
  })
}

for (const [name, { directory, source, manifest }] of packed) {
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    const installed =
      dependency === 'bytemd'
        ? packed.get('bytemd').directory
        : path.join(source, 'node_modules', dependency)
    if (dependency === 'bytemd')
      assert.equal(
        manifest.dependencies.bytemd,
        `npm:@jihua/bytemd@${coreManifest.version}`,
      )
    await link(installed, path.join(directory, 'node_modules', dependency))
  }
  for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
    await link(
      path.join(source, 'node_modules', peer),
      path.join(directory, 'node_modules', peer),
    )
  }
  await link(directory, path.join(consumer, 'node_modules', manifest.name))
  if (name === 'bytemd') continue
  const require = createRequire(path.join(directory, 'package.json'))
  const esm = await import(
    pathToFileURL(path.join(directory, 'dist/index.mjs'))
  )
  const cjs = require('./dist/index.js')
  assert.ok(esm.Editor && esm.Viewer)
  assert.ok(cjs.Editor && cjs.Viewer)
  checks.push({ package: manifest.name, esm: true, cjs: true })
  if (name === 'vue-next') {
    for (const entry of ['viewer', 'async']) {
      const module = await import(
        pathToFileURL(path.join(directory, `dist/${entry}.mjs`))
      )
      const common = require(`./dist/${entry}.js`)
      assert.ok(module.default ?? module.Viewer)
      assert.ok(common.default ?? common.Viewer)
      checks.push({
        package: `${manifest.name}/${entry}`,
        esm: true,
        cjs: true,
      })
    }
    // This chunk is imported only after AsyncEditor mounts; check its bare
    // imports directly so the SSR placeholder cannot hide a broken alias.
    const chunks = await fs.readdir(path.join(directory, 'dist/chunks'))
    for (const chunk of chunks.filter((file) => file.endsWith('.mjs'))) {
      const module = await import(
        pathToFileURL(path.join(directory, 'dist/chunks', chunk))
      )
      assert.ok(module.default)
    }
    for (const chunk of chunks.filter((file) => file.endsWith('.js'))) {
      assert.ok(require(`./dist/chunks/${chunk}`))
    }
    checks.push({ package: `${manifest.name}/async chunks`, imported: true })
  }
}

const core = packed.get('bytemd').directory
// Svelte is provided by a Svelte host; React type declarations by a React host.
await link(
  path.join(rootDir, 'node_modules/svelte'),
  path.join(consumer, 'node_modules/svelte'),
)
await link(
  path.join(rootDir, 'node_modules/svelte'),
  path.join(core, 'node_modules/svelte'),
)
await link(
  path.join(rootDir, 'packages/react/node_modules/@types/react'),
  path.join(consumer, 'node_modules/@types/react'),
)
await link(
  path.join(rootDir, 'packages/react/node_modules/react'),
  path.join(consumer, 'node_modules/react'),
)
const requireCore = createRequire(path.join(core, 'package.json'))
for (const entry of ['processor', 'worker', 'viewer']) {
  const esm = await import(pathToFileURL(path.join(core, `dist/${entry}.mjs`)))
  const cjs = requireCore(`./dist/${entry}.js`)
  assert.equal(typeof esm.renderMarkdown, 'function')
  assert.equal(typeof cjs.renderMarkdown, 'function')
  checks.push({
    package: `@jihua/bytemd/${entry}`,
    esm: true,
    cjs: true,
    noDOM: true,
  })
}

const shims = path
  .join(rootDir, 'node_modules/svelte2tsx/svelte-shims-v4.d.ts')
  .replaceAll('\\', '/')
async function checkTypes(
  name,
  source,
  { svelte = false, invalid = false } = {},
) {
  const filename = path.join(consumer, `${name}.${svelte ? 'tsx' : 'ts'}`)
  const code = svelte
    ? `/// <reference path="${shims}" />\n` +
      svelte2tsx(source, { filename: `${name}.svelte`, isTsFile: true }).code
    : source
  await fs.writeFile(filename, code)
  const program = ts.createProgram([filename], {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    customConditions: svelte ? ['svelte'] : [],
    jsx: ts.JsxEmit.Preserve,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  const messages = diagnostics.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  )
  if (invalid) {
    assert.ok(
      diagnostics.length >= 2 && diagnostics.every((d) => d.code === 2322),
      messages.join('\n'),
    )
  } else assert.deepEqual(messages, [], `${name} types`)
  checks.push({ types: name, passed: true, rejectedInvalidProps: invalid })
}

await checkTypes(
  'svelte-components',
  `
  <script lang="ts">
    import { Editor, Viewer, EditorComponent, ViewerComponent } from '@jihua/bytemd'
    let value = ''
    function change(event: CustomEvent<{ value: string }>) { value = event.detail.value }
  </script>
  <Editor {value} on:change={change} /><Viewer {value} />
  <EditorComponent {value} /><ViewerComponent {value} />
`,
  { svelte: true },
)
await checkTypes(
  'svelte-invalid-props',
  `
  <script lang="ts">import { Editor, Viewer, EditorComponent } from '@jihua/bytemd'</script>
  <Editor value={123} mode="invalid-mode" /><Viewer value={123} />
  <EditorComponent value={123} />
`,
  { svelte: true, invalid: true },
)
await checkTypes(
  'imperative-and-wrapper-types',
  `
  import { Editor, Viewer } from '@jihua/bytemd'
  import type { EditorProps as ReactProps } from '@jihua/bytemd-react'
  const editor = new Editor({ target: document.createElement('div'), props: { value: '' } })
  editor.$set({ value: 'updated' }); editor.$on('change', () => {}); editor.$destroy()
  const viewer = new Viewer({ target: document.createElement('div'), props: { value: '' } })
  viewer.$set({ value: 'updated' }); viewer.$destroy()
  const props: ReactProps = { value: '', mode: 'split' }
  // @ts-expect-error Markdown text must be a string
  const invalid: ReactProps = { value: 123 }
`,
)

await fs.writeFile(
  path.join(consumer, 'App.svelte'),
  `
  <script lang="ts">
    import { Editor, Viewer } from '@jihua/bytemd'
    let value = '# Svelte consumer'
  </script>
  <Editor {value} on:change={(event) => value = event.detail.value} />
  <Viewer {value} />
`,
)
await fs.writeFile(
  path.join(consumer, 'main.js'),
  `
  import { mount } from 'svelte'
  import App from './App.svelte'
  import '@jihua/bytemd/dist/index.css'
  mount(App, { target: document.getElementById('app') })
`,
)
await fs.writeFile(
  path.join(consumer, 'index.html'),
  '<div id="app"></div><script type="module" src="/main.js"></script>',
)
await build({
  configFile: false,
  root: consumer,
  plugins: [svelte({ configFile: false })],
  resolve: { dedupe: ['svelte'] },
  build: {
    outDir: path.join(output, 'svelte-consumer-dist'),
    emptyOutDir: false,
  },
})
checks.push({ package: 'Svelte host', productionBuild: true })

await fs.writeFile(
  path.join(output, 'results.json'),
  JSON.stringify({ checks }, null, 2),
)
console.log(JSON.stringify({ output, checks }, null, 2))
