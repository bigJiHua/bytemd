import { EvidenceArchiver } from './prod-perf-archiver.mjs'
import { CDPClient } from './prod-perf-cdp-client.mjs'
import { HeapProfilerController } from './prod-perf-heap-profiler.mjs'
import { KeyboardInjector } from './prod-perf-keyboard-injector.mjs'

const PREFIX = '__PROD_PERF_RESULT__:'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function evalInPage(session, expression) {
  const reply = await session.send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (reply.exceptionDetails)
    throw new Error(
      reply.exceptionDetails.exception?.description ||
        reply.exceptionDetails.text
    )
  return reply.result.value
}

export async function waitForPage(session, expression, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evalInPage(session, `return (${expression})`)) return
    await sleep(100)
  }
  throw new Error(`Timeout waiting for page condition: ${expression}`)
}

// Subscribe before invoking an action, including actions that emit synchronously.
export async function withPageEvent(session, type, action, timeoutMs = 180000) {
  let unsubscribe, timer
  const message = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timeout waiting for ${type}`)),
      timeoutMs
    )
    unsubscribe = session.on('Runtime.consoleAPICalled', ({ args }) => {
      for (const arg of args) {
        if (typeof arg.value !== 'string' || !arg.value.startsWith(PREFIX))
          continue
        const data = JSON.parse(arg.value.slice(PREFIX.length))
        if (data.type === type) resolve(data)
      }
    })
  })
  try {
    const [, result] = await Promise.all([action(), message])
    return result
  } finally {
    clearTimeout(timer)
    unsubscribe()
  }
}

export async function mountFixture(session, options) {
  return evalInPage(
    session,
    `return await window.__prodPerf.prepare(${JSON.stringify(options)})`
  )
}

async function realKeys(session, keyCount) {
  await evalInPage(session, 'window.__prodPerf.arm()')
  return withPageEvent(session, 'sample-complete', async () => {
    const keyboard = new KeyboardInjector()
    for (let key = 0; key < keyCount; key++)
      await keyboard.pressKey(session, 'a')
  })
}

export function validateSample(sample, keyCount) {
  if (sample.errors?.length) throw new Error(sample.errors.join('; '))
  if (sample.keyCount !== keyCount || !sample.valueMatchesPreview)
    throw new Error(
      `Lost keys/stale preview: expected ${keyCount}, got ${sample.keyCount}`
    )
  if (!sample.firstLine?.startsWith('a'.repeat(keyCount) + '# Long document'))
    throw new Error('Final text did not contain every dispatched key')
  for (const environment of [sample.environment, sample.active]) {
    if (
      environment.visibilityState !== 'visible' ||
      environment.viewport[0] !== 1280 ||
      environment.viewport[1] !== 800
    )
      throw new Error('Sample page was hidden or viewport changed')
  }
}

export async function runPerformanceSampling(session, archiver, options = {}) {
  const {
    sizes = [10, 100, 500],
    profiles = ['core', 'enhanced'],
    modes = ['worker', 'sync'],
    samples = 3,
  } = options
  const groups = []
  for (const size of sizes)
    for (const profile of profiles) {
      const byMode = Object.fromEntries(
        modes.map((mode) => [
          mode,
          { size, mode, profile, samples: [], validSamples: 0 },
        ])
      )
      // Alternate modes within each repetition to reduce time/order bias.
      for (let repetition = 0; repetition < samples; repetition++) {
        for (const mode of repetition % 2 ? [...modes].reverse() : modes) {
          const group = byMode[mode]
          const keyCount = size >= 500 ? 1 : 5
          const mounted = await mountFixture(session, {
            size,
            mode,
            profile,
            layoutContainment: !!options.layoutContainment,
          })
          const { sample } = await realKeys(session, keyCount)
          validateSample(sample, keyCount)
          const record = {
            schema: 2,
            size,
            mode,
            profile,
            repetition,
            mount: mounted,
            sample,
          }
          const filename = `prod-perf-${size}kib-${mode}-${profile}-${
            repetition + 1
          }.json`
          await archiver.archive(JSON.stringify(record, null, 2), filename)
          group.samples.push(record)
          group.validSamples++
          console.log(
            JSON.stringify({
              phase: 'performance',
              size,
              mode,
              profile,
              repetition,
              totalMs: sample.totalMs,
              maxLongTaskMs: sample.maxLongTaskMs,
              costs: sample.costMarks,
            })
          )
        }
      }
      groups.push(...Object.values(byMode))
    }
  return groups
}

export async function runCompositionValidation(
  session,
  archiver,
  options = {}
) {
  const results = []
  for (const mode of ['worker', 'sync'])
    for (const size of [10, 100, 500]) {
      await mountFixture(session, {
        mode,
        size,
        profile: 'core',
        layoutContainment: !!options.layoutContainment,
      })
      const before = await evalInPage(
        session,
        'return window.__prodPerf.resetComposition()'
      )
      await session.send('Input.imeSetComposition', {
        text: '你',
        selectionStart: 1,
        selectionEnd: 1,
      })
      await session.send('Input.imeSetComposition', {
        text: '你好世界',
        selectionStart: 4,
        selectionEnd: 4,
      })
      // Per spec 5.2.3 exception 2: if no async result returns during
      // composition, explicitly mark as not covered instead of failing.
      let asyncResultCovered = false
      try {
        await waitForPage(
          session,
          'window.__prodPerf.trace().inCompositionAsyncResult',
          5000
        )
        asyncResultCovered = true
      } catch {
        asyncResultCovered = false
      }
      await session.send('Input.insertText', { text: '你好世界' })
      await waitForPage(
        session,
        '!window.__prodPerf.trace().composing && window.__prodPerf.state().renderedMatchesEditor'
      )
      const submit = await evalInPage(
        session,
        'return window.__prodPerf.trace()'
      )
      if (
        submit.value !== '你好世界' + before ||
        !submit.events.some((event) => event.type === 'compositionstart') ||
        !submit.events.some((event) => event.type === 'compositionupdate') ||
        !submit.events.some((event) => event.type === 'compositionend')
      )
        throw new Error(`IME submit text/event mismatch: ${mode}/${size}`)
      const submitRecord = {
        case: 'submit',
        source: 'automated-cdp',
        mode,
        size,
        ...submit,
        inCompositionAsyncResult: asyncResultCovered,
        asyncResultNotCovered: !asyncResultCovered,
      }
      await archiver.archive(
        JSON.stringify(submitRecord, null, 2),
        `ime-${mode}-${size}kib-submit.json`
      )
      results.push({
        ...submitRecord,
        value: undefined,
        renderedValue: undefined,
      })
      const cancelBefore = await evalInPage(
        session,
        'return window.__prodPerf.resetComposition()'
      )
      await session.send('Input.imeSetComposition', {
        text: '取消',
        selectionStart: 2,
        selectionEnd: 2,
      })
      await session.send('Input.imeSetComposition', {
        text: '',
        selectionStart: 0,
        selectionEnd: 0,
      })
      await waitForPage(
        session,
        '!window.__prodPerf.trace().composing && window.__prodPerf.state().renderedMatchesEditor'
      )
      const cancel = await evalInPage(
        session,
        'return window.__prodPerf.trace()'
      )
      if (
        cancel.value !== cancelBefore ||
        !cancel.events.some((event) => event.type === 'compositionstart') ||
        !cancel.events.some((event) => event.type === 'compositionend')
      )
        throw new Error('IME cancellation did not restore the original text')
      const cancelRecord = {
        case: 'cancel',
        source: 'automated-cdp',
        mode,
        size,
        ...cancel,
      }
      await archiver.archive(
        JSON.stringify(cancelRecord, null, 2),
        `ime-${mode}-${size}kib-cancel.json`
      )
      results.push({
        ...cancelRecord,
        value: undefined,
        renderedValue: undefined,
      })
      console.log(
        JSON.stringify({
          phase: 'composition',
          mode,
          size,
          submit: 'passed',
          cancel: 'passed',
          asyncResultDuringComposition: submit.inCompositionAsyncResult,
        })
      )
    }
  return {
    automated: results,
    manualOS: {
      status: 'incomplete',
      reason: 'Human verifier with real OS input method required',
    },
  }
}

export function heapNodeSummary(snapshot) {
  const heap = JSON.parse(snapshot.toString())
  const fields = heap.snapshot.meta.node_fields
  const stride = fields.length
  const types = heap.snapshot.meta.node_types[fields.indexOf('type')]
  const counts = {},
    named = {}
  let bytes = 0
  for (let index = 0; index < heap.nodes.length; index += stride) {
    const type = types[heap.nodes[index + fields.indexOf('type')]]
    counts[type] = (counts[type] || 0) + 1
    bytes += heap.nodes[index + fields.indexOf('self_size')]
    if (type !== 'native' && type !== 'object') continue
    const name = heap.strings[heap.nodes[index + fields.indexOf('name')]]
    if (
      /CodeMirror|Worker|ResizeObserver|MutationObserver|Detached|HTML.*Element/.test(
        name
      )
    )
      named[name] = (named[name] || 0) + 1
  }
  return {
    nodeCount: heap.nodes.length / stride,
    selfSize: bytes,
    counts,
    named,
  }
}

export async function runMemoryCheck(session, archiver, options = {}) {
  const heap = new HeapProfilerController()
  const results = []
  await session.send('Performance.enable')
  // Warm lazy plugin modules/Worker once; retained module cache is not an instance leak.
  await mountFixture(session, {
    mode: 'worker',
    size: 100,
    profile: 'enhanced',
    layoutContainment: !!options.layoutContainment,
  })
  await evalInPage(session, 'await window.__prodPerf.destroy()')
  for (let loop = 0; loop < (options.memoryLoops ?? 3); loop++) {
    const phases = {}
    for (const phase of [
      'before-mount',
      'after-mount',
      'after-edit',
      'after-destroy',
    ]) {
      if (phase === 'after-mount')
        await mountFixture(session, {
          mode: 'worker',
          size: 100,
          profile: 'enhanced',
          layoutContainment: !!options.layoutContainment,
        })
      if (phase === 'after-edit') await realKeys(session, 1)
      if (phase === 'after-destroy')
        await evalInPage(session, 'await window.__prodPerf.destroy()')
      // DevTools console stores object arguments, including third-party DOM logs.
      // Clear debugger roots explicitly; do not mistake them for application leaks.
      await session.send('Runtime.discardConsoleEntries')
      let immediateAfterDestroy
      if (phase === 'after-destroy') {
        await heap.collectGarbage(session)
        immediateAfterDestroy = await heap.getDomCounters(session)
        // CodeMirror blur/polling and plugin cancellation have bounded timers.
        // Preserve immediate counters and measure again after a documented wait.
        await sleep(1000)
      }
      await heap.collectGarbage(session)
      const counters = await heap.getDomCounters(session)
      const page = await evalInPage(session, 'return window.__prodPerf.state()')
      const snapshot = await heap.takeSnapshot(session, phase)
      if (!snapshot.complete)
        throw new Error(`Incomplete heap snapshot: ${phase}`)
      const filename = `heap-snapshot-${loop}-${phase}.heapsnapshot`
      await archiver.archive(snapshot.snapshot, filename)
      phases[phase] = {
        gcForced: true,
        devtoolsConsoleCleared: true,
        settledMs: phase === 'after-destroy' ? 1000 : 0,
        immediateAfterDestroy,
        counters,
        page,
        snapshot: {
          filename,
          bytes: snapshot.snapshot.length,
          ...heapNodeSummary(snapshot.snapshot),
        },
      }
    }
    const before = phases['before-mount'],
      after = phases['after-destroy']
    const delta = Object.fromEntries(
      Object.keys(before.snapshot.counts).map((key) => [
        key,
        (after.snapshot.counts[key] || 0) - before.snapshot.counts[key],
      ])
    )
    const result = {
      loop,
      phases,
      afterDestroyMinusBefore: {
        jsHeap: after.counters.jsHeapUsedSize - before.counters.jsHeapUsedSize,
        nodes: after.counters.nodes - before.counters.nodes,
        listeners:
          after.counters.jsEventListeners - before.counters.jsEventListeners,
        heapNodeTypes: delta,
      },
      method:
        'Forced GC after each completed phase; warm baseline; real snapshot node-count comparison. Object deltas do not prove absence of leaks.',
    }
    await archiver.archive(
      JSON.stringify(result, null, 2),
      `heap-counters-loop${loop}.json`
    )
    results.push(result)
    console.log(
      JSON.stringify({
        phase: 'memory',
        loop,
        delta: result.afterDestroyMinusBefore,
      })
    )
  }
  return results
}

export async function runAllSampling(options) {
  const {
    debugPort,
    pageUrl,
    auditDir,
    phases = ['performance', 'composition', 'memory'],
  } = options
  const session = await new CDPClient().connect(debugPort, pageUrl)
  const archiver = new EvidenceArchiver(auditDir)
  const report = {
    schema: 2,
    performance: null,
    composition: null,
    memory: null,
    errors: [],
    mobile: { status: 'incomplete', reason: 'No real mobile device available' },
  }
  try {
    await session.send('Runtime.enable')
    await session.send('Page.enable')
    await session.send('Page.bringToFront')
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await waitForPage(
      session,
      '!!window.__prodPerf && document.readyState === "complete"'
    )
    await evalInPage(
      session,
      'await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'
    )
    for (const [phase, run] of Object.entries({
      performance: runPerformanceSampling,
      composition: runCompositionValidation,
      memory: runMemoryCheck,
      comparison: runLayoutComparison,
      diagnostic: runDiagnostic,
      interaction: runInteractionChecks,
    })) {
      if (!phases.includes(phase)) continue
      try {
        report[phase] = await run(session, archiver, options)
      } catch (error) {
        report.errors.push({ phase, error: error.stack })
        console.error(error)
        continue
      }
    }
    await archiver.archive(
      JSON.stringify(report, null, 2),
      'prod-perf-summary.json'
    )
    return report
  } finally {
    await session.disconnect()
  }
}

export async function runDiagnostic(session, archiver) {
  await mountFixture(session, { mode: 'worker', size: 500, profile: 'core' })
  await session.send('Profiler.enable')
  await session.send('Profiler.start')
  const events = []
  const detach = session.on('Tracing.dataCollected', ({ value }) =>
    events.push(...value)
  )
  await session.send('Tracing.start', {
    categories: 'devtools.timeline',
    transferMode: 'ReportEvents',
  })
  const { sample } = await realKeys(session, 1)
  const { profile } = await session.send('Profiler.stop')
  await new Promise((resolve, reject) => {
    const off = session.on('Tracing.tracingComplete', () => {
      off()
      resolve()
    })
    session.send('Tracing.end').catch(reject)
  })
  detach()
  await archiver.archive(JSON.stringify(profile), 'cost-key-cpu.cpuprofile')
  await archiver.archive(
    JSON.stringify({ traceEvents: events }),
    'cost-key-trace.json'
  )
  const timeByFunction = {}
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
  profile.samples.forEach((id, index) => {
    const node = nodes.get(id),
      name = node.callFrame.functionName || '(anonymous)'
    timeByFunction[name] =
      (timeByFunction[name] || 0) + profile.timeDeltas[index] / 1000
  })
  const result = {
    sample,
    topFunctions: Object.entries(timeByFunction)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15),
    layout: events
      .filter(
        (event) => event.name === 'Layout' || event.name === 'UpdateLayoutTree'
      )
      .map(({ name, ts, dur, args }) => ({ name, ts, ms: dur / 1000, args })),
  }
  await archiver.archive(
    JSON.stringify(result, null, 2),
    'cost-key-diagnostic.json'
  )
  console.log(
    JSON.stringify({
      phase: 'diagnostic',
      topFunctions: result.topFunctions,
      layouts: result.layout.map(({ name, ms }) => ({ name, ms })),
    })
  )
  return result
}

export async function runInteractionChecks(session, archiver) {
  await mountFixture(session, {
    mode: 'worker',
    size: 100,
    profile: 'enhanced',
    layoutContainment: true,
  })
  const layout = await evalInPage(
    session,
    `
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    cm.setSelection({line: 0, ch: 2}, {line: 0, ch: 5});
    const selection = JSON.stringify(cm.listSelections());
    const body = document.querySelector('.bytemd-body');
    const measure = () => ({width: body.clientWidth, height: body.clientHeight,
      nodes: body.querySelectorAll('*').length, scrollHeight: document.querySelector('.bytemd-preview').scrollHeight});
    const enabled = measure();
    await window.__prodPerf.configure({layoutContainment: false});
    const disabled = measure();
    await window.__prodPerf.configure({layoutContainment: true});
    return {enabled, disabled, selectionKept: selection === JSON.stringify(cm.listSelections()),
      allTextPresent: document.querySelector('.markdown-body').textContent.includes('End of document.')};
  `
  )
  if (
    JSON.stringify(layout.enabled) !== JSON.stringify(layout.disabled) ||
    !layout.selectionKept ||
    !layout.allTextPresent
  )
    throw new Error(
      'Containment changed document dimensions, content or selection'
    )
  const toc = await evalInPage(
    session,
    `
    document.querySelector('.bytemd-toolbar-icon[aria-label="Table of contents"]').click();
    await new Promise(r => setTimeout(r, 250));
    const target = [...document.querySelectorAll('.bytemd-toc-button')].find(button => button.textContent.trim() === 'Section 16');
    if (!target) throw new Error('Missing TOC target');
    target.click();
    await new Promise(r => setTimeout(r, 250));
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    const preview = document.querySelector('.bytemd-preview');
    const heading = [...preview.querySelectorAll('h2')].find(node => node.textContent === 'Section 16');
    const scrollMarginTop = parseFloat(getComputedStyle(heading).scrollMarginTop) || 0;
    return {editorTop: cm.getScrollInfo().top, previewTop: preview.scrollTop,
      headingDelta: Math.abs(heading.getBoundingClientRect().top - preview.getBoundingClientRect().top),
      scrollMarginTop,
      active: document.querySelector('.bytemd-toc-active')?.textContent.trim()};
  `
  )
  if (
    toc.editorTop <= 0 ||
    toc.previewTop <= 0 ||
    Math.abs(toc.headingDelta - toc.scrollMarginTop) > 16 ||
    toc.active !== 'Section 16'
  )
    throw new Error(`TOC/scroll sync failed: ${JSON.stringify(toc)}`)
  const accordion = await evalInPage(
    session,
    `
    const details = document.querySelector('details');
    const before = document.querySelector('.bytemd-preview').scrollHeight;
    details.open = !details.open;
    await new Promise(r => requestAnimationFrame(r));
    return {before, after: document.querySelector('.bytemd-preview').scrollHeight};
  `
  )
  if (accordion.before === accordion.after)
    throw new Error('Accordion did not change preview layout')
  await evalInPage(session, 'window.__prodPerf.fail()')
  await waitForPage(session, '!!document.querySelector(".bytemd-render-error")')
  const errorCleared = await evalInPage(
    session,
    'return !document.querySelector(".bytemd-preview svg") && !document.querySelector(".bytemd-toc-button")'
  )
  if (!errorCleared) throw new Error('Failed preview retained old effects/TOC')
  await evalInPage(session, 'await window.__prodPerf.recover()')
  if (await evalInPage(session, 'return window.__prodPerf.state().errors'))
    throw new Error('Preview did not recover')
  await evalInPage(session, 'await window.__prodPerf.stale()')
  await waitForPage(
    session,
    'document.querySelector(".markdown-body")?.textContent.includes("Only the latest preview should remain.")'
  )
  const result = {
    layout,
    toc,
    accordion,
    errorCleared,
    recovery: 'passed',
    staleResult: 'passed',
    note: 'All preview content remains in DOM. Containment toggles preserve geometry/selection; TOC, scroll sync, accordion and async failures were exercised.',
  }
  await archiver.archive(
    JSON.stringify(result, null, 2),
    'prod-perf-interaction.json'
  )
  console.log(JSON.stringify({ phase: 'interaction', result }))
  return result
}

export async function runLayoutComparison(session, archiver, options = {}) {
  const results = []
  for (const size of options.sizes ?? [100, 500])
    for (const profile of options.profiles ?? ['core', 'enhanced']) {
      for (
        let repetition = 0;
        repetition < (options.samples ?? 3);
        repetition++
      ) {
        const variants = [
          ...(options.variants ?? [
            'baseline',
            'editor-layout',
            'preview-layout',
          ]),
        ]
        for (const variant of repetition % 2 ? variants.reverse() : variants) {
          await mountFixture(session, { mode: 'worker', size, profile })
          await evalInPage(
            session,
            `
          const target = document.querySelector(${JSON.stringify(
            variant.startsWith('body-')
              ? '.bytemd-body'
              : variant === 'editor-layout'
              ? '.bytemd-editor'
              : '.bytemd-preview'
          )});
          target.style.contain = ${JSON.stringify(
            variant === 'baseline'
              ? ''
              : variant === 'body-size'
              ? 'size'
              : variant === 'body-size-layout'
              ? 'size layout'
              : 'layout'
          )};
          target.getBoundingClientRect();
          await new Promise(resolve => requestAnimationFrame(resolve));
        `
          )
          const { sample } = await realKeys(session, 1)
          validateSample(sample, 1)
          const record = { size, profile, variant, repetition, sample }
          results.push(record)
          await archiver.archive(
            JSON.stringify(record, null, 2),
            `cost-layout-${size}kib-${profile}-${variant}-${repetition}.json`
          )
          console.log(
            JSON.stringify({
              phase: 'comparison',
              size,
              profile,
              variant,
              repetition,
              firstFrameMs: sample.firstFrameMs,
              maxLongTaskMs: sample.maxLongTaskMs,
              totalMs: sample.totalMs,
              costs: sample.costMarks,
            })
          )
        }
      }
    }
  return results
}
