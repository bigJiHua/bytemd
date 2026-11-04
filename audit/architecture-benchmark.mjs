import { rootDir } from '../scripts/utils.mjs'
import { EvidenceArchiver } from './prod-perf-archiver.mjs'
import { BrowserLauncher } from './prod-perf-browser-launcher.mjs'
import { CDPClient, evalInPage, waitForPage } from './prod-perf-cdp-client.mjs'
import { HeapProfilerController } from './prod-perf-heap-profiler.mjs'
import { KeyboardInjector } from './prod-perf-keyboard-injector.mjs'
import { runPerformanceSampling } from './prod-perf-sample.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { build, preview } from 'vite'

const { values } = parseArgs({
  options: {
    label: { type: 'string' },
    samples: { type: 'string', default: '3' },
    'soak-minutes': { type: 'string', default: '0' },
    'skip-matrix': { type: 'boolean' },
    'skip-kernel': { type: 'boolean' },
    'heap-snapshots': { type: 'boolean' },
    startup: { type: 'boolean' },
    port: { type: 'string', default: '5206' },
    'debug-port': { type: 'string', default: '9406' },
  },
})
assert.match(values.label ?? '', /^[a-z0-9-]+$/)
const samples = Number(values.samples)
const soakMinutes = Number(values['soak-minutes'])
assert.ok(Number.isSafeInteger(samples) && samples > 0)
assert.ok(Number.isFinite(soakMinutes) && soakMinutes >= 0)
const output = await fs.mkdtemp(
  path.join(rootDir, `audit/prod-perf-architecture-${values.label}-`),
)
const report = {
  label: values.label,
  output,
  started: new Date().toISOString(),
  samples,
  matrixStatus: values['skip-matrix'] ? 'skipped' : 'pending',
  kernelStatus: values['skip-kernel'] ? 'skipped' : 'pending',
  errors: [],
}
console.log(`Architecture evidence: ${output}`)
const configFile = path.join(rootDir, 'audit/prod-perf-vite.config.mjs')
const keyboard = new KeyboardInjector()
let server, browser, session
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const save = () =>
  fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify(report, null, 2),
  )
const counters = async () => {
  // DevTools console arguments can retain detached DOM (e.g. Mermaid's
  // diagnostic nodes). Remove inspector-owned roots before measuring the app.
  await session.send('Runtime.discardConsoleEntries')
  await session.send('HeapProfiler.collectGarbage')
  await delay(200)
  return {
    elapsedMs: Date.now() - report.soak.startedAt,
    ...(await session.send('Memory.getDOMCounters')),
    ...(await session.send('Runtime.getHeapUsage')),
  }
}
try {
  await build({ configFile })
  report.build = 'passed'
  server = await preview({
    configFile,
    preview: { host: '127.0.0.1', port: Number(values.port), strictPort: true },
  })
  const pageUrl = `http://127.0.0.1:${values.port}/prod-perf/prod-perf-ui.html`
  browser = await new BrowserLauncher().launch({
    debugPort: Number(values['debug-port']),
    headless: true,
    url: pageUrl,
  })
  session = await new CDPClient().connect(Number(values['debug-port']), pageUrl)
  await session.send('Runtime.enable')
  report.console = []
  session.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (report.console.length < 100)
      report.console.push({
        type,
        args: args.map(({ type, subtype, value, description }) => ({
          type,
          subtype,
          text: String(value ?? description ?? '').slice(0, 300),
        })),
      })
  })
  session.on('Runtime.exceptionThrown', ({ exceptionDetails }) =>
    report.errors.push(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    ),
  )
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await waitForPage(session, '!!window.__prodPerf', 30000)
  report.environment = await evalInPage(
    session,
    'return window.__prodPerf.state().environment',
  )
  await evalInPage(
    session,
    `return window.__prodPerf.prepare({size:10, mode:'worker', profile:'${soakMinutes > 0 ? 'enhanced' : 'core'}', layoutContainment:true})`,
  )
  if (!values['skip-matrix']) {
    const archiver = new EvidenceArchiver(output)
    report.matrix = await runPerformanceSampling(session, archiver, {
      samples,
      layoutContainment: true,
    })
    report.matrixStatus = 'passed'
    await save()
  }
  if (!values['skip-kernel']) {
    report.kernel = []
    for (const size of [10, 100, 500]) {
      for (const frontmatter of [false, true]) {
        for (let repetition = 0; repetition < samples; repetition++) {
          const mount = await evalInPage(
            session,
            `return window.__prodPerf.kernelPrepare(${JSON.stringify({ size, frontmatter, layoutContainment: true })})`,
          )
          const read = await evalInPage(
            session,
            'return window.__prodPerf.readValueCost(100)',
          )
          for (let i = 0; i < 20; i++) {
            await keyboard.pressKey(session, 'a')
            await delay(40)
          }
          await waitForPage(
            session,
            'window.__prodPerf.readKernel().metrics.length === 20 && window.__prodPerf.readKernel().metrics.every(item => Number.isFinite(item.frameMs) && Number.isFinite(item.changeMs))',
            10000,
          )
          const result = await evalInPage(
            session,
            'return window.__prodPerf.readKernel()',
          )
          assert.ok(
            (frontmatter ? result.lastLine : result.firstLine).startsWith(
              'a'.repeat(20),
            ),
          )
          assert.equal(result.length, mount.length + 20)
          report.kernel.push({
            size,
            frontmatter,
            repetition,
            mount,
            read,
            ...result,
          })
          console.log(
            JSON.stringify({
              phase: 'kernel',
              size,
              frontmatter,
              repetition,
              readMs: read.elapsedMs,
              mountMs: mount.mountMs,
              frameMax: Math.max(...result.metrics.map((item) => item.frameMs)),
            }),
          )
          await save()
        }
      }
    }
    report.kernelStatus = 'passed'
  }
  if (values.startup) {
    report.startup = []
    for (const size of [10, 100, 500]) {
      for (const profile of ['core', 'enhanced']) {
        for (let repetition = 0; repetition < samples; repetition++) {
          await evalInPage(session, 'return window.__prodPerf.destroy()')
          const sample = await evalInPage(
            session,
            `return window.__prodPerf.defaultStartup(${JSON.stringify({ size, profile })})`,
          )
          assert.deepEqual(sample.errors, [])
          report.startup.push({ size, profile, repetition, ...sample })
          console.log(
            JSON.stringify({
              phase: 'default-startup',
              size,
              profile,
              repetition,
              ...sample,
            }),
          )
          await save()
        }
      }
    }
  }
  if (soakMinutes > 0) {
    report.soak = {
      minutes: soakMinutes,
      startedAt: Date.now(),
      edits: 0,
      checkpoints: [],
    }
    await evalInPage(session, 'return window.__prodPerf.destroy()')
    await delay(1000)
    report.soak.beforeMount = await counters()
    const snapshot = async (label) => {
      const result = await new HeapProfilerController().takeSnapshot(
        session,
        label,
      )
      assert.ok(result.complete, 'Heap snapshot incomplete')
      await fs.writeFile(
        path.join(output, `${label}.heapsnapshot`),
        result.snapshot,
      )
    }
    if (values['heap-snapshots']) await snapshot('before-mount')
    await evalInPage(
      session,
      "return window.__prodPerf.prepare({size:100, mode:'worker', profile:'enhanced', layoutContainment:true})",
    )
    const initial = await evalInPage(
      session,
      'return window.__prodPerf.trace().value.length',
    )
    report.soak.checkpoints.push(await counters())
    let nextCheckpoint = Date.now() + 60000
    const deadline = Date.now() + soakMinutes * 60000
    while (Date.now() < deadline) {
      await evalInPage(
        session,
        `const cm = document.querySelector('.CodeMirror').CodeMirror; cm.focus(); cm.setCursor({line:0,ch:${report.soak.edits}})`,
      )
      await keyboard.pressKey(session, 'a')
      report.soak.edits++
      await delay(450)
      await waitForPage(
        session,
        'window.__prodPerf.state().renderedMatchesEditor && !window.__prodPerf.state().pending',
        30000,
      )
      await evalInPage(
        session,
        `const cm = document.querySelector('.CodeMirror').CodeMirror; const info = cm.getScrollInfo(); cm.scrollTo(0, (info.height-info.clientHeight)*${(report.soak.edits % 10) / 10}); document.documentElement.classList.toggle('dark', ${report.soak.edits % 2 === 0}); return window.__prodPerf.state()`,
      )
      await delay(250)
      if (Date.now() >= nextCheckpoint) {
        const state = await evalInPage(
          session,
          'return window.__prodPerf.state()',
        )
        assert.equal(state.errors, 0)
        assert.equal(state.renderedMatchesEditor, true)
        assert.equal(
          await evalInPage(
            session,
            'return window.__prodPerf.trace().value.length',
          ),
          initial + report.soak.edits,
        )
        report.soak.checkpoints.push({
          edits: report.soak.edits,
          ...(await counters()),
        })
        console.log(
          JSON.stringify({
            phase: 'soak',
            label: values.label,
            ...report.soak.checkpoints.at(-1),
          }),
        )
        await save()
        nextCheckpoint = Date.now() + 60000
      }
    }
    report.soak.afterEdits = await counters()
    await evalInPage(session, 'return window.__prodPerf.destroy()')
    await delay(1000)
    report.soak.afterDestroy = await counters()
    await delay(4000)
    report.soak.afterDestroySettled = await counters()
    if (values['heap-snapshots']) await snapshot('after-destroy')
    report.soak.destroyDelta = Object.fromEntries(
      ['nodes', 'jsEventListeners', 'usedSize'].map((key) => [
        key,
        report.soak.afterDestroySettled[key] - report.soak.beforeMount[key],
      ]),
    )
    assert.ok(
      report.soak.destroyDelta.nodes <= 0,
      'Destroyed editors retained DOM nodes',
    )
    assert.ok(
      report.soak.destroyDelta.jsEventListeners <= 0,
      'Destroyed editors retained event listeners',
    )
    assert.ok(
      report.soak.destroyDelta.usedSize < 5 * 1024 * 1024,
      'Destroyed heap growth exceeded 5 MiB',
    )
    report.soak.status = 'completed'
    delete report.soak.startedAt
  }
  assert.deepEqual(report.errors, [])
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.errors.push(error.stack)
  process.exitCode = 1
} finally {
  report.ended = new Date().toISOString()
  await save()
  await session?.disconnect()
  await browser?.close()
  await new Promise((resolve) =>
    server?.httpServer ? server.httpServer.close(resolve) : resolve(),
  )
  console.log(
    JSON.stringify({
      label: values.label,
      output,
      status: report.status,
      errors: report.errors,
    }),
  )
}
