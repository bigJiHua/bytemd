import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { compile } from 'svelte/compiler'

const requireCore = createRequire(
  new URL('../packages/bytemd/package.json', import.meta.url)
)
const checks = []
assert.equal(typeof globalThis.document, 'undefined')
for (const entry of ['processor', 'worker']) {
  const esm = await import(`../packages/bytemd/dist/${entry}.mjs`)
  const cjs = requireCore(`bytemd/${entry}`)
  for (const [format, module] of [
    ['esm', esm],
    ['cjs', cjs],
  ]) {
    const result = module.renderMarkdown({
      value: '# Pure entry\n\n[color=#f00]red[/color]',
      sourceMap: true,
      version: 7,
    })
    assert.match(result.file.toString(), /data-bytemd-block="7-0"/)
    assert.match(result.file.toString(), /color:#f00/)
    if (entry === 'worker')
      assert.equal(typeof module.installWorkerRenderer, 'function')
    checks.push({ entry, format, noDOM: true, rendered: true })
  }
  for (const suffix of ['mjs', 'js']) {
    const code = await fs.readFile(
      new URL(`../packages/bytemd/dist/${entry}.${suffix}`, import.meta.url),
      'utf8'
    )
    assert.doesNotMatch(
      code,
      /(?:from|require\()\s*["'](?:svelte|codemirror|tippy|select-files)|\.css["']/
    )
  }
  await fs.access(
    new URL(`../packages/bytemd/dist/${entry}.d.ts`, import.meta.url)
  )
}
const viewerSource = await fs.readFile(
  new URL('../packages/bytemd/svelte/viewer.svelte', import.meta.url),
  'utf8'
)
const ssrSource = compile(viewerSource, {
  generate: 'ssr',
  filename: 'viewer.svelte',
}).js.code.replace(
  /from (["'])\.\/([^"']+)\1/g,
  (_, quote) => `from ${quote}../packages/bytemd/dist/index.mjs${quote}`
)
const temporary = new URL('./worker-ssr-viewer.mjs', import.meta.url)
try {
  await fs.writeFile(temporary, ssrSource)
  const { default: Viewer } = await import(temporary.href)
  const sync = Viewer.render({ value: '# SSR preserved' }).html
  assert.match(sync, /<h1>SSR preserved<\/h1>/)
  let invoked = 0
  const async = Viewer.render({
    value: '# SSR pending',
    renderer: () => {
      invoked++
      throw new Error('must not start')
    },
  }).html
  assert.equal(invoked, 0)
  assert.match(async, /role="status"/)
  assert.match(async, /aria-busy="true"/)
  checks.push({
    framework: 'Svelte SSR',
    defaultHTML: true,
    asyncPending: true,
    workerNotStarted: true,
  })
} finally {
  await fs.rm(temporary, { force: true })
}
const requireReact = createRequire(
  new URL('../packages/react/package.json', import.meta.url)
)
const React = requireReact('react')
const { renderToString } = requireReact('react-dom/server')
const { Viewer: ReactViewer } = requireReact('./dist/index.js')
assert.match(
  renderToString(React.createElement(ReactViewer, { value: '# React SSR' })),
  /<h1>React SSR<\/h1>/
)
let invoked = 0
const asyncReact = renderToString(
  React.createElement(ReactViewer, {
    value: '# pending',
    renderer: () => {
      invoked++
      throw new Error('must not start')
    },
  })
)
assert.equal(invoked, 0)
assert.match(asyncReact, /role="status"/)
checks.push({
  framework: 'React SSR',
  defaultHTML: true,
  asyncPending: true,
  workerNotStarted: true,
})
const outputName = process.argv[2] ?? 'worker-entry-results.json'
if (!/^[a-z0-9-]+\.json$/.test(outputName))
  throw new Error('Expected an audit JSON filename')
await fs.writeFile(
  new URL(`./${outputName}`, import.meta.url),
  JSON.stringify({ date: new Date().toISOString(), checks }, null, 2)
)
console.log(JSON.stringify(checks))
