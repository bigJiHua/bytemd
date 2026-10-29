// CM6 closeout browser verification: capability tokens (frontmatter, inline
// HTML, markdown marks, headings) in light/dark, Enter list continuation via
// extraKeys, and the 100x mount/destroy loop over the production consumer
// page. Results go to audit/cm6-closeout-results.json (gitignored).
import { BrowserLauncher } from './prod-perf-browser-launcher.mjs'
import { CDPClient } from './prod-perf-cdp-client.mjs'
import { HeapProfilerController } from './prod-perf-heap-profiler.mjs'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const vite = join(root, 'node_modules/vite/bin/vite.js')
const previewPort = Number(process.argv[2] || 5186)
const debugPort = 9518
const pageUrl = `http://127.0.0.1:${previewPort}/prod-perf/prod-perf-ui.html`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const capabilityFixture = [
  '---',
  'title: "Hello World"',
  'num: 42',
  'flag: true',
  'note: # trailing comment',
  '---',
  '',
  '# Heading 1',
  '',
  '**bold** *em* <div class="x">tag</div>',
  '',
  '- item',
].join('\n')

if (!existsSync(join(root, 'packages/bytemd/svelte/index.js')))
  throw new Error('Missing built packages; run pnpm build first')

const preview = spawn(
  process.execPath,
  [
    vite,
    'preview',
    '--config',
    'audit/prod-perf-vite.config.mjs',
    '--host',
    '127.0.0.1',
    '--port',
    String(previewPort),
    '--strictPort',
  ],
  { cwd: root, stdio: 'ignore' },
)

const consoleProblems = []

async function main() {
  const deadline = Date.now() + 30000
  let reachable = false
  while (Date.now() < deadline && !reachable) {
    try {
      if ((await fetch(pageUrl)).ok) reachable = true
    } catch {}
    await sleep(250)
  }
  if (!reachable) throw new Error('Preview did not start')

  const browser = await new BrowserLauncher().launch({
    debugPort,
    headless: true,
    url: pageUrl,
  })
  let session
  try {
    session = await new CDPClient().connect(debugPort, pageUrl)
    session.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type !== 'error' && type !== 'warning') return
      const text = args
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ')
      // The preview server has no favicon; this 404 is a documented artifact.
      if (text.includes('favicon.ico')) return
      consoleProblems.push(`${type}: ${text}`)
    })
    session.on('Log.entryAdded', ({ entry }) => {
      if (entry.level !== 'error' && entry.level !== 'warning') return
      // The preview server has no favicon; this 404 is a documented artifact.
      if (
        entry.text.includes('favicon.ico') ||
        entry.url?.includes('favicon.ico')
      )
        return
      consoleProblems.push(`${entry.level}: ${entry.text}`)
    })
    await session.send('Runtime.enable')
    await session.send('Page.enable')
    await session.send('Log.enable')
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    })
    const evaluate = async (expression) => {
      const result = await session.send('Runtime.evaluate', {
        expression: `(async () => { ${expression} })()`,
        awaitPromise: true,
        returnByValue: true,
      })
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.exception?.description ||
            result.exceptionDetails.text,
        )
      return result.result.value
    }
    await sleep(2500)

    await evaluate(
      `return await window.__prodPerf.prepare({ mode: 'sync', size: 10, profile: 'core', layoutContainment: false })`,
    )
    await evaluate(`(() => {
      const cm = document.querySelector('.CodeMirror').CodeMirror
      cm.setValue(${JSON.stringify(capabilityFixture)})
      return cm.getValue().length
    })()`)
    await sleep(500)

    const collectTokens = `(() => {
      const content = document.querySelector('.cm-content')
      const colors = (selector) => [...content.querySelectorAll(selector)]
        .slice(0, 4)
        .map((node) => getComputedStyle(node).color)
      const findSpan = (text, root) => {
        for (const node of root.querySelectorAll('span')) {
          if (node.textContent === text && node.children.length === 0)
            return getComputedStyle(node).color
        }
        return null
      }
      const headingLine = [...content.querySelectorAll('.cm-line')].find(
        (line) => line.textContent.includes('# Heading 1'),
      )
      const headingSpan = headingLine
        ? [...headingLine.querySelectorAll('span')]
            .filter((node) => node.children.length === 0)
            .map((node) => ({
              text: node.textContent,
              color: getComputedStyle(node).color,
              fontWeight: getComputedStyle(node).fontWeight,
              fontSize: getComputedStyle(node).fontSize,
            }))
            .find((token) => token.text.includes('Heading'))
        : null
      const htmlLine = [...content.querySelectorAll('.cm-line')].find((line) =>
        line.textContent.includes('<div class="x">tag</div>'),
      )
      return {
        frontmatter: {
          keys: [...content.querySelectorAll('.bytemd-yaml-key')].map((n) => n.textContent),
          strings: [...content.querySelectorAll('.bytemd-yaml-string')].map((n) => n.textContent),
          numbers: [...content.querySelectorAll('.bytemd-yaml-number')].map((n) => n.textContent),
          keywords: [...content.querySelectorAll('.bytemd-yaml-keyword')].map((n) => n.textContent),
          comments: [...content.querySelectorAll('.bytemd-yaml-comment')].map((n) => n.textContent),
          keyColor: colors('.bytemd-yaml-key')[0] || null,
          stringColor: colors('.bytemd-yaml-string')[0] || null,
          numberColor: colors('.bytemd-yaml-number')[0] || null,
          keywordColor: colors('.bytemd-yaml-keyword')[0] || null,
          commentColor: colors('.bytemd-yaml-comment')[0] || null,
          fenceColor: colors('.bytemd-yaml-punct')[0] || null,
        },
        inlineHtml: {
          tagColor: htmlLine ? findSpan('div', htmlLine) : null,
          attributeColor: htmlLine ? findSpan('class', htmlLine) : null,
          stringColor: htmlLine ? findSpan('"x"', htmlLine) : null,
        },
        marks: {
          boldMarkColor: findSpan('**', content),
        },
        heading: headingSpan,
        bodyColor: getComputedStyle(content).color,
      }
    })()`
    const light = await evaluate(`return ${collectTokens}`)

    // Dark palette switches on the editor root itself.
    await evaluate(`(() => {
      document.querySelector('.bytemd').classList.add('dark')
      return true
    })()`)
    await sleep(200)
    const dark = await evaluate(`return ${collectTokens}`)
    await evaluate(`(() => {
      document.querySelector('.bytemd').classList.remove('dark')
      return true
    })()`)

    // Fresh mount: token collection above leaves the shared page editor in a
    // state the synthetic keydown must not depend on.
    await evaluate(
      `return await window.__prodPerf.prepare({ mode: 'sync', size: 10, profile: 'core', layoutContainment: false })`,
    )
    await sleep(300)
    await evaluate(`(() => {
      const host = document.querySelector('.CodeMirror')
      if (!host) throw new Error('editor missing before Enter test')
      const cm = host.CodeMirror
      cm.setValue('- item')
      return cm.getValue()
    })()`)
    // setValue and the keydown run as separate evaluations: a combined eval
    // returned an undefined completion value under CDP returnByValue.
    const enterContinuationRaw = await session.send('Runtime.evaluate', {
      expression: `(async () => { return (() => {
      const cm = document.querySelector('.CodeMirror').CodeMirror
      cm.focus()
      cm.setCursor({ line: 0, ch: 6 })
      cm.view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
      const after = document.querySelector('.CodeMirror')
      return { value: cm.getValue(), editorAlive: !!after }
    })() })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (enterContinuationRaw.exceptionDetails)
      throw new Error(
        enterContinuationRaw.exceptionDetails.exception?.description ||
          enterContinuationRaw.exceptionDetails.text,
      )
    const enterContinuation = enterContinuationRaw.result?.value

    // 100x mount/destroy cycle over the production consumer page. One warm-up
    // cycle settles GC/lazy-module noise before the baseline counters.
    const heap = new HeapProfilerController()
    await session.send('Performance.enable')
    await evaluate(`return await window.__prodPerf.destroy()`).catch(() => {})
    await evaluate(
      `return await window.__prodPerf.prepare({ mode: 'sync', size: 10, profile: 'core', layoutContainment: false })`,
    )
    await evaluate(`return await window.__prodPerf.destroy()`)
    await heap.collectGarbage(session)
    await sleep(500)
    await heap.collectGarbage(session)
    const before = await heap.getDomCounters(session)
    const cyclesStart = Date.now()
    for (let cycle = 0; cycle < 100; cycle++) {
      await evaluate(
        `return await window.__prodPerf.prepare({ mode: 'sync', size: 10, profile: 'core', layoutContainment: false })`,
      )
      await evaluate(`return await window.__prodPerf.destroy()`)
    }
    const cyclesMs = Date.now() - cyclesStart
    await heap.collectGarbage(session)
    await sleep(1000)
    await heap.collectGarbage(session)
    const after = await heap.getDomCounters(session)
    const cycleDelta = {
      nodes: after.nodes - before.nodes,
      listeners: after.jsEventListeners - before.jsEventListeners,
      jsHeap: after.jsHeapUsedSize - before.jsHeapUsedSize,
    }

    const result = {
      pageUrl,
      light,
      dark,
      enterContinuation,
      mountDestroy: { cycles: 100, elapsedMs: cyclesMs, delta: cycleDelta },
      consoleProblems,
      measuredAt: new Date().toISOString(),
    }
    await writeFile(
      join(root, 'audit/cm6-closeout-results.json'),
      JSON.stringify(result, null, 2),
    )
    console.log(JSON.stringify(result, null, 2))
    return result
  } finally {
    await session?.disconnect().catch(() => {})
    await browser?.close()
  }
}

main()
  .then((result) => {
    const { light, dark, enterContinuation, mountDestroy, consoleProblems } =
      result
    const problems = []
    if (enterContinuation.value !== '- item\n- ')
      problems.push(
        `Enter continuation: ${JSON.stringify(enterContinuation.value)}`,
      )
    if (!enterContinuation.editorAlive) problems.push('editor gone after Enter')
    if (light.frontmatter.keys.join(',') !== 'title,num,flag,note')
      problems.push('frontmatter keys')
    if (light.inlineHtml.tagColor === light.bodyColor)
      problems.push('inline HTML tag color')
    if (light.marks.boldMarkColor === light.bodyColor)
      problems.push('markdown mark color')
    if (light.heading?.fontWeight !== '600') problems.push('heading weight')
    if (light.frontmatter.keyColor === dark.frontmatter.keyColor)
      problems.push('dark token switch')
    if (mountDestroy.delta.nodes !== 0 || mountDestroy.delta.listeners !== 0)
      problems.push(
        `mount/destroy delta ${mountDestroy.delta.nodes}/${mountDestroy.delta.listeners}`,
      )
    if (consoleProblems.length) problems.push('console problems')
    if (problems.length) {
      console.error('VERIFY FAILED: ' + problems.join('; '))
      process.exitCode = 1
    } else {
      console.log('VERIFY PASSED')
    }
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => preview.kill())
