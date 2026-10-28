<script lang="ts">
  import '../packages/bytemd/dist/index.css'
  import '../packages/bytemd/dist/markdown.css'
  import {
    Editor,
    createWorkerRenderer,
    renderMarkdown,
  } from '../packages/bytemd/svelte/index.js'
  import gfm from '../packages/plugin-gfm/dist/index.mjs'
  import highlight from '../packages/plugin-highlight/dist/index.mjs'
  import math from '../packages/plugin-math/dist/index.mjs'
  import '../packages/plugin-math/node_modules/katex/dist/katex.css'
  import mermaid from '../packages/plugin-mermaid/dist/index.mjs'
  import { performanceFixture } from './performance-fixtures.mjs'
  import { onDestroy } from 'svelte'

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
  const results: any[] = []
  const checks: any[] = []
  const tasks: any[] = []
  const enhanced = [gfm(), highlight(), math(), mermaid()]
  const parserCallbacks = enhanced.filter((p) => p.remark || p.rehype)
  const round = (n: number) => Math.round(n * 100) / 100
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
  const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
    ? new PerformanceObserver((list) => {
        tasks.push(
          ...list
            .getEntries()
            .map(({ startTime, duration }) => ({ startTime, duration }))
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
              p.rehype === parserCallbacks[i].rehype
          )
        )
          return { profile: 'enhanced', fail: forceFailure }
      },
    }
  )
  // Paired performance uses the same asynchronous component lifecycle in both modes.
  // This adapter deliberately runs the identical built processor on the main thread.
  const mainThread = async (options: any) => renderMarkdown(options)
  const tracked = async (options: any) => {
    const current = sample
    const result = await (mode === 'worker'
      ? worker(options)
      : mainThread(options))
    if (current && sample === current) {
      current.render = { mode: result.mode, ...result.timings }
      current.receivedAt = performance.now()
    }
    return result
  }
  const publish = () =>
    (output = JSON.stringify(
      {
        schema: 1,
        date: new Date().toISOString(),
        environment: {
          userAgent: navigator.userAgent,
          visibilityState: document.visibilityState,
          hardwareConcurrency: navigator.hardwareConcurrency,
          viewport: [innerWidth, innerHeight],
          longTaskSupported: !!observer,
        },
        method: {
          source:
            'Latest built Svelte Editor, processor, Worker and plugin ESM; Vite development harness',
          comparison:
            'Same async Viewer lifecycle; sync adapter executes renderMarkdown on the main thread; worker executes the identical processor off thread',
          frames:
            'RAF availability and largest RAF interval during request/DOM/plugin completion; not OS presentation latency',
          clocks:
            'Worker reports durations only; receivedAt and DOM measurements use main-thread performance.now',
          edits: 'Real browser key events; default 300ms preview debounce',
          memory:
            'No forced GC or heap snapshot. No Chinese IME or foreground production measurement.',
        },
        results,
        checks,
      },
      null,
      2
    ))

  function begin(operation: string) {
    let resolve: () => void
    const ready = new Promise<void>((r) => (resolve = r))
    const current: any = {
      operation,
      mode,
      profile,
      kib: size,
      bytes: fixture.bytes,
      started: performance.now(),
      frameMaxGapMs: 0,
      errors: [],
      ready,
      resolve: () => resolve(),
      expected: fixture.expected,
      previousFrame: performance.now(),
    }
    sample = current
    const heartbeat = () => {
      const now = performance.now()
      if (sample !== current || current.ended) return
      current.frameMaxGapMs = Math.max(
        current.frameMaxGapMs,
        now - current.previousFrame
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
        if (!armed || event.key.length !== 1 || event.ctrlKey || event.metaKey)
          return
        armed = false
        busy = true
        status = '真实按键渲染中'
        const current = begin('real-key')
        finish(current).then(() => {
          busy = false
          status = '真实按键测量完成'
          publish()
        })
      }
      root.addEventListener('keydown', keydown, true)
      return () => root.removeEventListener('keydown', keydown, true)
    },
    viewerEffect({ markdownBody, file }: any) {
      const current = sample
      if (!current || current.effectsAt) return
      current.effectsAt = performance.now()
      current.domAndCopyMs = current.receivedAt
        ? current.effectsAt - current.receivedAt
        : null
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
          current.totalMs = performance.now() - current.started
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
  }
  async function finish(current: any) {
    await current.ready
    await frame()
    await frame()
    current.ended = true
    const entries = tasks.filter(
      (t) =>
        t.startTime + t.duration > current.started &&
        t.startTime < performance.now()
    )
    current.longTasks = entries
    current.maxLongTaskMs = Math.max(0, ...entries.map((t) => t.duration))
    current.blockingMs = entries.reduce(
      (sum, t) => sum + Math.max(0, t.duration - 50),
      0
    )
    for (const key of [
      'frameMaxGapMs',
      'firstFrameMs',
      'totalMs',
      'domAndCopyMs',
      'maxLongTaskMs',
      'blockingMs',
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
    sample = undefined
    publish()
  }
  async function prepare() {
    busy = true
    armed = false
    forceFailure = false
    status = '挂载并测量中'
    fixture = performanceFixture(size, profile === 'enhanced')
    const current = begin('mount')
    mount(fixture.markdown)
    await finish(current)
    busy = false
    status = '预览完成，可准备真实按键'
    publish()
  }
  function arm() {
    armed = true
    status = '已准备：在编辑区按一个字符'
    editor.focus()
    editor.setCursor({ line: 0, ch: 0 })
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
  const onError = (event: any) => {
    sample?.errors.push(String(event.detail.error))
  }
  onDestroy(() => {
    observer?.disconnect()
    component?.$destroy()
    worker.destroy()
  })
</script>

<main>
  <h1>ByteMD Worker 渲染验收</h1>
  <p>
    固定 10 / 100 / 500 KiB 文档；同时记录主线程长任务、帧间隔与完整预览耗时。
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
    <button on:click={uiChecks} disabled={busy || armed}>加载交互验收</button>
    <button on:click={fail} disabled={busy || armed || !component}
      >模拟线程失败</button
    >
    <button on:click={recover} disabled={busy || armed}>恢复预览</button>
    <button on:click={stale} disabled={busy || armed}>旧结果丢弃</button>
  </div>
  <p role="status" id="audit-status">{status}</p>
  <div bind:this={sandbox} on:bytemd-plugin-error={onError} />
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
