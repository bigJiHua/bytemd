<script lang="ts">
  import '../packages/bytemd/dist/index.css'
  import '../packages/bytemd/dist/markdown.css'
  // Source entry shares the page's Svelte runtime; `bytemd/dist` bundles its
  // own copy and the built `svelte/` dir is not type-checkable under the
  // package tsconfig (rootDir=src) since the Svelte 5 migration.
  import {
    Editor,
    createWorkerRenderer,
    renderMarkdown,
  } from '../packages/bytemd/src'
  import gfm from '../packages/plugin-gfm/dist/index.mjs'
  import highlight from '../packages/plugin-highlight/dist/index.mjs'
  import math from '../packages/plugin-math/dist/index.mjs'
  import '../packages/plugin-math/node_modules/katex/dist/katex.css'
  import mermaid from '../packages/plugin-mermaid/dist/index.mjs'
  import { performanceFixture } from './performance-fixtures.mjs'
  import { onDestroy, onMount } from 'svelte'

  export const PROD_PERF_VERSION = 2
  const CDP_PREFIX = '__PROD_PERF_RESULT__:'
  const VIEWPORT_W = 1280
  const VIEWPORT_H = 800

  let sandbox: HTMLElement
  let component: any
  let editor: any
  let busy = false
  let armed = false
  let mode = 'worker'
  let size = 10
  let profile = 'core'
  let status = '等待验收'
  let output = ''
  let sample: any
  let fixture: any
  let forceFailure = false
  let generation = 0
  let layoutContainment = false
  let composing = false
  let asyncResultDuringComposition = false
  let renderedValue = ''
  const results: any[] = []
  const checks: any[] = []
  const tasks: any[] = []
  const compositionEvents: any[] = []
  const enhanced = [gfm(), highlight(), math(), mermaid()]
  const parserCallbacks = enhanced.filter((p) => p.remark || p.rehype)
  const round = (n: number) => Math.round(n * 100) / 100
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
  const sessionStart = performance.now()

  const parseBrowser = (ua: string) => {
    if (/Edg\//.test(ua))
      return {
        name: 'Edge',
        version: (ua.match(/Edg\/([\d.]+)/) || [])[1] || '',
      }
    if (/Chrome\//.test(ua))
      return {
        name: 'Chrome',
        version: (ua.match(/Chrome\/([\d.]+)/) || [])[1] || '',
      }
    if (/Firefox\//.test(ua))
      return {
        name: 'Firefox',
        version: (ua.match(/Firefox\/([\d.]+)/) || [])[1] || '',
      }
    if (/Safari\//.test(ua))
      return {
        name: 'Safari',
        version: (ua.match(/Version\/([\d.]+)/) || [])[1] || '',
      }
    return { name: 'Unknown', version: '' }
  }

  const environment = () => {
    const b = parseBrowser(navigator.userAgent)
    return {
      userAgent: navigator.userAgent,
      browserName: b.name,
      browserVersion: b.version,
      visibilityState: document.visibilityState,
      hardwareConcurrency: navigator.hardwareConcurrency,
      logicalThreadCount: navigator.hardwareConcurrency,
      deviceMemory: (navigator as any).deviceMemory,
      viewport: [innerWidth, innerHeight],
      fixedViewport: [VIEWPORT_W, VIEWPORT_H],
      longTaskSupported: !!observer,
      nativeYieldSupported:
        typeof (window as any).scheduler?.yield === 'function',
      sessionDurationMs: round(performance.now() - sessionStart),
    }
  }

  const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
    ? new PerformanceObserver((list) => {
        tasks.push(
          ...list
            .getEntries()
            .map(({ startTime, duration }) => ({ startTime, duration })),
        )
      })
    : undefined
  observer?.observe({ entryTypes: ['longtask'] })

  const worker = createWorkerRenderer(
    () =>
      new Worker(new URL('./worker-entry.ts', import.meta.url), {
        type: 'module',
      }),
    {
      timeoutMs: 120000,
      resolveOptions(options) {
        if (options.sanitize || options.remarkRehype !== undefined) return
        const callbacks =
          options.plugins?.filter((p) => p.remark || p.rehype) ?? []
        if (!callbacks.length) return { profile: 'core', fail: forceFailure }
        if (
          callbacks.length === parserCallbacks.length &&
          callbacks.every(
            (p, i) =>
              p.remark === parserCallbacks[i].remark &&
              p.rehype === parserCallbacks[i].rehype,
          )
        )
          return { profile: 'enhanced', fail: forceFailure }
      },
    },
  )
  const mainThread = async (options: any) => renderMarkdown(options)
  const tracked = async (options: any) => {
    const current = sample
    const requestedAt = performance.now()
    const result = await (mode === 'worker'
      ? worker(options)
      : mainThread(options))
    if (composing) asyncResultDuringComposition = true
    renderedValue = result.value
    if (current && sample === current) {
      current.render = { mode: result.mode, ...result.timings }
      current.receivedAt = performance.now()
      current.costMarks.parsing = round(result.timings.renderMs)
      current.costMarks.workerRoundTrip =
        mode === 'worker' ? round(current.receivedAt - requestedAt) : null
      current.costMarks.workerOverhead =
        mode === 'worker'
          ? round(
              Math.max(
                0,
                current.receivedAt - requestedAt - result.timings.renderMs,
              ),
            )
          : null
    }
    return result
  }
  const cdpEmit = (data: any) => {
    console.log(CDP_PREFIX + JSON.stringify(data))
  }
  const publish = () =>
    (output = JSON.stringify(
      {
        schema: PROD_PERF_VERSION,
        date: new Date().toISOString(),
        environment: environment(),
        method: {
          source:
            'Production consumer page built with vite build + vite preview; not a Vite dev page',
          comparison:
            'Same async Viewer lifecycle; sync adapter executes renderMarkdown on the main thread; worker executes the identical processor off thread',
          frames:
            'RAF availability and largest RAF interval during request/DOM/plugin completion; not OS presentation latency',
          clocks:
            'Worker reports durations only; receivedAt and DOM measurements use main-thread performance.now',
          edits:
            'Real browser key events via CDP Input.dispatchKeyEvent; default 300ms preview debounce',
          memory:
            'Page-side lightweight counts only; forced GC and heap snapshots via CDP HeapProfiler',
          cost: 'Four-way split: codemirror-update, worker-communication, parsing, dom-insert-layout',
        },
        results,
        checks,
      },
      null,
      2,
    ))

  function begin(operation: string) {
    let resolve: () => void
    const ready = new Promise<void>((r) => (resolve = r))
    const current: any = {
      operation,
      mode,
      profile,
      layoutContainment,
      kib: size,
      bytes: fixture.bytes,
      started: performance.now(),
      frameMaxGapMs: 0,
      errors: [],
      ready,
      resolve: () => resolve(),
      expected: fixture.expected,
      previousFrame: performance.now(),
      compositionEvents: [],
      costMarks: {},
      keyCount: 0,
      keyUpdateDurations: [],
      environment: environment(),
    }
    sample = current
    const heartbeat = () => {
      const now = performance.now()
      if (sample !== current || current.ended) return
      current.frameMaxGapMs = Math.max(
        current.frameMaxGapMs,
        now - current.previousFrame,
      )
      current.previousFrame = now
      if (current.firstFrameMs === undefined)
        current.firstFrameMs = now - current.started
      requestAnimationFrame(heartbeat)
    }
    requestAnimationFrame(heartbeat)
    return current
  }

  const probe = {
    editorEffect({ editor: cm, root }: any) {
      editor = cm
      const keydown = (event: KeyboardEvent) => {
        if (
          event.key.length !== 1 ||
          event.ctrlKey ||
          event.metaKey ||
          event.isComposing
        )
          return
        if (armed) {
          armed = false
          busy = true
          status = '真实按键渲染中'
          const current = begin('real-key')
          finish(current).then((record) => {
            busy = false
            status = '真实按键测量完成'
            publish()
            cdpEmit({ type: 'sample-complete', sample: record })
          })
        }
        if (sample?.operation === 'real-key') {
          sample.keyCount++
          sample.lastKeyAt = performance.now()
          sample.awaitingKeyUpdate = true
        }
      }
      const update = () => {
        if (sample?.awaitingKeyUpdate) {
          sample.awaitingKeyUpdate = false
          const duration = round(performance.now() - sample.lastKeyAt)
          sample.keyUpdateDurations.push(duration)
          sample.costMarks.codemirrorFirstUpdate = duration
        }
      }
      cm.on('update', update)
      root.addEventListener('keydown', keydown, true)
      const compositionstart = (e: CompositionEvent) => {
        composing = true
        const rec = {
          type: 'compositionstart',
          timestamp: performance.now(),
          data: e.data,
        }
        compositionEvents.push(rec)
        sample?.compositionEvents.push(rec)
        cdpEmit({ type: 'composition-event', event: rec })
      }
      const compositionupdate = (e: CompositionEvent) => {
        const rec = {
          type: 'compositionupdate',
          timestamp: performance.now(),
          data: e.data,
        }
        compositionEvents.push(rec)
        sample?.compositionEvents.push(rec)
        cdpEmit({ type: 'composition-event', event: rec })
      }
      const compositionend = (e: CompositionEvent) => {
        composing = false
        const rec = {
          type: 'compositionend',
          timestamp: performance.now(),
          data: e.data,
        }
        compositionEvents.push(rec)
        sample?.compositionEvents.push(rec)
        cdpEmit({ type: 'composition-event', event: rec })
      }
      root.addEventListener('compositionstart', compositionstart, true)
      root.addEventListener('compositionupdate', compositionupdate, true)
      root.addEventListener('compositionend', compositionend, true)
      return () => {
        cm.off('update', update)
        editor = undefined
        root.removeEventListener('keydown', keydown, true)
        root.removeEventListener('compositionstart', compositionstart, true)
        root.removeEventListener('compositionupdate', compositionupdate, true)
        root.removeEventListener('compositionend', compositionend, true)
      }
    },
    viewerEffect({ markdownBody, file }: any) {
      const current = sample
      if (!current || current.effectsAt) return
      current.effectsAt = performance.now()
      current.domAndCopyMs = current.receivedAt
        ? current.effectsAt - current.receivedAt
        : null
      current.costMarks.domCommitAndCopy =
        current.domAndCopyMs === null ? null : round(current.domAndCopyMs)
      const layoutStarted = performance.now()
      current.previewHeight = markdownBody.parentElement.scrollHeight
      current.costMarks.initialLayout = round(performance.now() - layoutStarted)
      current.metadataKept = typeof file.message === 'function'
      const poll = () => {
        if (sample !== current) return
        const counts = {
          math: markdownBody.querySelectorAll('.katex').length,
          highlight: markdownBody.querySelectorAll('pre>code.language-js.hljs')
            .length,
          mermaid: markdownBody.querySelectorAll('.bytemd-mermaid svg').length,
          blocks: markdownBody.querySelectorAll('[data-bytemd-block]').length,
          copy: markdownBody.querySelectorAll('.bytemd-copy-btn').length,
        }
        if (
          counts.math >= fixture.expected.math &&
          counts.highlight >= fixture.expected.highlight &&
          counts.mermaid >= fixture.expected.mermaid
        ) {
          current.counts = counts
          current.previewHeight = markdownBody.parentElement.scrollHeight
          current.costMarks.effectsToComplete = round(
            performance.now() - current.effectsAt,
          )
          current.totalMs = performance.now() - current.started
          current.lastKeyToPreviewMs =
            current.lastKeyAt === undefined
              ? null
              : round(performance.now() - current.lastKeyAt)
          current.resolve()
        } else if (performance.now() - current.started > 120000) {
          current.errors.push('DOM plugin completion timed out')
          current.resolve()
        } else requestAnimationFrame(poll)
      }
      requestAnimationFrame(poll)
    },
  }
  function mount(value: string, defaultSync = false) {
    const token = ++generation
    component?.$destroy()
    sandbox.innerHTML = ''
    component = new Editor({
      target: sandbox,
      props: {
        value,
        mode: 'split',
        layoutContainment,
        renderer: defaultSync ? undefined : tracked,
        locale: {
          renderPending: 'Worker 正在渲染预览',
          renderError: 'Worker 渲染失败，可重新尝试',
        },
        plugins: [probe, ...(profile === 'enhanced' ? enhanced : [])],
      },
    })
    component.$on('change', (event: any) => {
      if (token === generation) component.$set({ value: event.detail.value })
    })
    component.$on('bytemd-plugin-error', (event: any) => {
      sample?.errors.push(String(event.detail.error))
    })
  }
  async function finish(current: any) {
    await current.ready
    await frame()
    await frame()
    current.ended = true
    const entries = tasks.filter(
      (t) =>
        t.startTime + t.duration > current.started &&
        t.startTime < performance.now(),
    )
    current.longTasks = entries
    current.maxLongTaskMs = Math.max(0, ...entries.map((t) => t.duration))
    current.blockingMs = entries.reduce(
      (sum, t) => sum + Math.max(0, t.duration - 50),
      0,
    )
    current.domNodeCount = sandbox.querySelectorAll('*').length
    current.jsHeapEstimate = (performance as any).memory?.usedJSHeapSize
    current.valueMatchesPreview = editor?.getValue() === renderedValue
    current.firstLine = editor?.getLine(0)
    current.active = environment()
    for (const key of [
      'frameMaxGapMs',
      'firstFrameMs',
      'totalMs',
      'domAndCopyMs',
      'maxLongTaskMs',
      'blockingMs',
      'domNodeCount',
      'jsHeapEstimate',
    ])
      if (typeof current[key] === 'number') current[key] = round(current[key])
    const {
      ready,
      resolve,
      started,
      receivedAt,
      effectsAt,
      previousFrame,
      ended,
      ...record
    } = current
    results.push(record)
    if (results.length > 4) results.shift()
    sample = undefined
    tasks.length = 0
    publish()
    return record
  }
  async function prepare() {
    busy = true
    armed = false
    forceFailure = false
    status = '挂载并测量中'
    fixture = performanceFixture(size, profile === 'enhanced')
    const current = begin('mount')
    mount(fixture.markdown)
    const record = await finish(current)
    busy = false
    status = '预览完成，可准备真实按键'
    publish()
    cdpEmit({ type: 'mount-complete', sample: record })
    return record
  }
  function arm() {
    armed = true
    status = '已准备：在编辑区按一个字符'
    editor.focus()
    editor.setCursor({ line: 0, ch: 0 })
    cdpEmit({ type: 'armed' })
  }
  function setManualIME() {
    status = '人工 IME 模式：请在编辑区用真实输入法输入'
    cdpEmit({ type: 'manual-ime-ready' })
  }
  function markNotIME() {
    cdpEmit({
      type: 'not-ime',
      note: 'No composition events detected for this insertion',
    })
  }
  async function memoryCycleStart() {
    busy = true
    status = '内存循环：挂载前基线'
    cdpEmit({ type: 'memory-phase', phase: 'before-mount' })
    fixture = performanceFixture(size, profile === 'enhanced')
    const current = begin('memory-before-mount')
    mount(fixture.markdown)
    await finish(current)
    cdpEmit({ type: 'memory-phase', phase: 'after-mount', sample: current })
    status = '内存循环：挂载后，请通过 CDP 编辑后继续'
    busy = false
    publish()
  }
  async function memoryCycleDestroy() {
    busy = true
    status = '内存循环：销毁中'
    component?.$destroy()
    component = undefined
    editor = undefined
    sample = undefined
    results.length = 0
    checks.length = 0
    tasks.length = 0
    compositionEvents.length = 0
    renderedValue = ''
    output = ''
    sandbox.innerHTML = ''
    await frame()
    cdpEmit({ type: 'memory-phase', phase: 'after-destroy' })
    status = '内存循环：已销毁，可通过 CDP 采集堆快照'
    busy = false
  }
  async function uiChecks() {
    busy = true
    armed = false
    profile = 'enhanced'
    mode = 'worker'
    size = 10
    fixture = performanceFixture(10, true)
    const current = begin('ui-fixture')
    mount(fixture.markdown)
    await finish(current)
    checks.push({
      kind: 'render',
      ...results[results.length - 1].counts,
      metadataKept: results[results.length - 1].metadataKept,
    })
    busy = false
    status = '交互验收：复制、目录和错误恢复'
    publish()
  }
  function fail() {
    forceFailure = true
    component.$set({ value: '# Failed Worker preview' })
    status = '等待错误反馈'
  }
  async function recover() {
    forceFailure = false
    await uiChecks()
  }
  async function stale() {
    busy = true
    forceFailure = false
    profile = 'core'
    mode = 'worker'
    fixture = performanceFixture(100, false)
    mount(fixture.markdown)
    await frame()
    component.$set({
      value: '# Latest request\n\nOnly the latest preview should remain.',
    })
    status = '等待旧结果丢弃验收'
    busy = false
  }
  onDestroy(() => {
    observer?.disconnect()
    component?.$destroy()
    worker.destroy()
  })
  onMount(() => {
    const api = {
      async prepare(options: any) {
        mode = options.mode
        size = options.size
        profile = options.profile
        layoutContainment = !!options.layoutContainment
        return prepare()
      },
      arm,
      async configure(props: any) {
        if ('layoutContainment' in props)
          layoutContainment = !!props.layoutContainment
        component.$set(props)
        await frame()
        await frame()
      },
      destroy: memoryCycleDestroy,
      resetComposition() {
        compositionEvents.length = 0
        asyncResultDuringComposition = false
        editor.focus()
        editor.setCursor({ line: 0, ch: 0 })
        return editor.getValue()
      },
      trace() {
        return {
          events: [...compositionEvents],
          inCompositionAsyncResult: asyncResultDuringComposition,
          composing,
          value: editor.getValue(),
          renderedValue,
          selection: editor.listSelections(),
          environment: environment(),
        }
      },
      state() {
        return {
          busy,
          armed,
          renderedMatchesEditor: editor?.getValue() === renderedValue,
          pending: !!sandbox.querySelector('.bytemd-render-pending'),
          errors: sandbox.querySelectorAll('[role="alert"]').length,
          domNodes: sandbox.querySelectorAll('*').length,
          environment: environment(),
        }
      },
      uiChecks,
      fail,
      recover,
      stale,
    }
    ;(window as any).__prodPerf = api
    return () => {
      delete (window as any).__prodPerf
    }
  })
</script>

<main>
  <h1>ByteMD 生产消费页性能验收</h1>
  <p>
    固定 {VIEWPORT_W}×{VIEWPORT_H} 视口；10 / 100 / 500 KiB 文档；同步/Worker 双模式；
    真实键盘、composition、长任务、RAF 间隔与成本四项分离。
  </p>
  <div class="controls">
    <label
      >模式 <select bind:value={mode} disabled={busy || armed}
        ><option value="worker">Worker</option><option value="sync"
          >同步处理器对照</option
        ></select
      ></label
    >
    <label
      >规模 <select bind:value={size} disabled={busy || armed}
        ><option value={10}>10 KiB</option><option value={100}>100 KiB</option
        ><option value={500}>500 KiB</option></select
      ></label
    >
    <label
      >插件 <select bind:value={profile} disabled={busy || armed}
        ><option value="core">core</option><option value="enhanced"
          >enhanced</option
        ></select
      ></label
    >
    <button on:click={prepare} disabled={busy || armed}>测量挂载</button>
    <button on:click={arm} disabled={busy || armed || !component}
      >准备真实按键</button
    >
    <button on:click={setManualIME} disabled={busy || armed || !component}
      >人工 IME 模式</button
    >
    <button on:click={markNotIME} disabled={busy || armed}>标注非 IME</button>
    <button on:click={memoryCycleStart} disabled={busy || armed}
      >内存循环：挂载</button
    >
    <button on:click={memoryCycleDestroy} disabled={busy || armed}
      >内存循环：销毁</button
    >
    <button on:click={uiChecks} disabled={busy || armed}>加载交互验收</button>
    <button on:click={fail} disabled={busy || armed || !component}
      >模拟线程失败</button
    >
    <button on:click={recover} disabled={busy || armed}>恢复预览</button>
    <button on:click={stale} disabled={busy || armed}>旧结果丢弃</button>
  </div>
  <p role="status" id="audit-status">{status}</p>
  <div bind:this={sandbox} />
  <label>验收结果 JSON <textarea readonly value={output} rows="5" /></label>
</main>

<style>
  :global(body) {
    margin: 0;
    color: #1f2937;
    background: #f4f6f8;
    font-family: system-ui, sans-serif;
  }
  main {
    max-width: 1160px;
    margin: 16px auto;
    padding: 0 16px;
  }
  h1 {
    font-size: 24px;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  button,
  select {
    padding: 6px;
  }
  textarea {
    display: block;
    width: 100%;
    font-size: 11px;
  }
  :global(.bytemd) {
    height: 480px;
  }
</style>
