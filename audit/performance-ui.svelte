<script lang="ts">
  import '../packages/bytemd/dist/index.css'
  import '../packages/bytemd/dist/markdown.css'
  import {
    Editor,
    getProcessor,
    addCopyButtons,
    runViewerEffects,
  } from '../packages/bytemd/svelte/index.js'
  import gfm from '../packages/plugin-gfm/dist/index.mjs'
  import highlight from '../packages/plugin-highlight/dist/index.mjs'
  import math from '../packages/plugin-math/dist/index.mjs'
  import '../packages/plugin-math/node_modules/katex/dist/katex.css'
  import mermaid from '../packages/plugin-mermaid/dist/index.mjs'
  import controlHighlight from './performance-control-highlight'
  import controlMath from './performance-control-math'
  import { performanceFixture } from './performance-fixtures.mjs'
  import { onDestroy } from 'svelte'

  let sandbox: HTMLElement
  let component: any
  let codeMirror: any
  let busy = false
  let status = '等待测量'
  let size = 10
  let profile = 'core'
  let label = 'before'
  let waitingForKeyboard = false
  let sample: any
  let fixture: any
  let longTasks: { startTime: number; duration: number }[] = []
  const results: any[] = []
  let resolveHighlight: (library: any) => void
  const highlightReady = new Promise<any>(
    (resolve) => (resolveHighlight = resolve)
  )
  const plugins = {
    core: [],
    enhanced: [
      gfm(),
      highlight({
        init: (library) => {
          resolveHighlight(library)
        },
      }),
      math({ katexOptions: { output: 'html' } }),
      mermaid(),
    ],
  }
  const controlPlugins = [
    gfm(),
    controlHighlight(highlightReady),
    controlMath({ katexOptions: { output: 'html' } }),
    mermaid(),
  ]
  const heap = () => (performance as any).memory?.usedJSHeapSize ?? null
  const frame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  const round = (n: number) => Math.round(n * 100) / 100
  const observer = PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ? new PerformanceObserver((list) => {
        longTasks.push(
          ...list
            .getEntries()
            .map(({ startTime, duration }) => ({ startTime, duration }))
        )
      })
    : undefined
  observer?.observe({ entryTypes: ['longtask'] })
  onDestroy(() => {
    observer?.disconnect()
    component?.$destroy()
  })

  const artifact = () => ({
    schema: 1,
    label,
    date: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB: (navigator as any).deviceMemory ?? null,
      viewport: [innerWidth, innerHeight],
      longTaskSupported: !!observer,
      heapEstimateSupported: heap() !== null,
      visibilityState: document.visibilityState,
      nativeYieldSupported:
        typeof (globalThis as any).scheduler?.yield === 'function',
    },
    method: {
      source:
        'Built core Svelte Editor and built plugin ESM, Vite development harness',
      bytes:
        'Exact ASCII UTF-8 10/100/500 KiB; fixed generator in performance-fixtures.mjs',
      enhanced:
        'GFM; one JS block and two inline formulas per eight sections; three Mermaid diagrams per document',
      phases:
        'Parse, AST transforms, stringify instrument unified methods. DOM/copy includes teardown, Svelte and Editor work between stringify and first viewerEffect. Layout is one forced scrollHeight read; other implicit layout remains in its owning phase. Plugin readiness is observed DOM completion, not exclusive CPU time.',
      edits:
        'API edit is CodeMirror.replaceRange; keyboard burst uses real browser key events. Both include default 300ms preview debounce. First-frame delay is requestAnimationFrame availability, not an OS presentation measurement.',
      memory:
        'performance.memory is a coarse process JS heap estimate without forced GC. DOM counts are exact within the fixture. No heap snapshot or leak proof.',
      samples:
        'Three mount and three API-edit samples per size/profile; module warmup is recorded separately. No p95 claim from three samples.',
      control:
        'Alternating unbatched valid-node control and production batched effects on identical prepared HTML. Highlighter reuses the initialized production library; math uses the same KaTeX ESM entry and options. Preparation and initialization are excluded.',
    },
    results,
  })
  let output = ''
  const publish = () => (output = JSON.stringify(artifact(), null, 2))

  function begin(operation: string) {
    let resolve: () => void
    const ready = new Promise<void>((r) => (resolve = r))
    sample = {
      operation,
      kib: size,
      profile,
      inputBytes: fixture.bytes,
      sections: fixture.sections,
      expected: fixture.expected,
      started: performance.now(),
      heapBefore: heap(),
      renders: [],
      errors: [],
      ready,
      resolve: () => resolve(),
    }
    const current = sample
    requestAnimationFrame(() => {
      current.firstFrameMs = round(performance.now() - current.started)
    })
    return current
  }

  const probe = {
    remark(processor: any) {
      const parse = processor.parse
      const run = processor.run
      const stringify = processor.stringify
      processor.parse = function (file: any) {
        const current = sample
        const render: any = { parseStarted: performance.now() }
        const tree = parse.call(this, file)
        render.parseMs = performance.now() - render.parseStarted
        file.data.performanceProbe = render
        current?.renders.push(render)
        return tree
      }
      processor.run = function (tree: any, file: any, done: any) {
        const started = performance.now()
        return run.call(
          this,
          tree,
          file,
          (error: any, result: any, resultFile: any) => {
            file.data.performanceProbe.transformMs = performance.now() - started
            done(error, result, resultFile)
          }
        )
      }
      processor.stringify = function (tree: any, file: any) {
        const started = performance.now()
        const html = stringify.call(this, tree, file)
        file.data.performanceProbe.stringifyMs = performance.now() - started
        file.data.performanceProbe.stringifyEnd = performance.now()
        return html
      }
      return processor
    },
    editorEffect({ editor, root }: any) {
      codeMirror = editor
      if (sample)
        sample.editorReadyMs = round(performance.now() - sample.started)
      const keydown = (event: KeyboardEvent) => {
        if (
          !waitingForKeyboard ||
          event.key.length !== 1 ||
          event.ctrlKey ||
          event.metaKey
        )
          return
        if (!sample || sample.operation !== 'keyboard-burst')
          begin('keyboard-burst')
        sample.lastKeyAt = performance.now()
        sample.keys = (sample.keys ?? 0) + 1
      }
      root.addEventListener('keydown', keydown, true)
      return () => root.removeEventListener('keydown', keydown, true)
    },
    viewerEffect({ markdownBody, file }: any) {
      const current = sample
      const render = file.data.performanceProbe
      if (!current || !render || !current.renders.includes(render)) return
      render.domAndCopyMs = performance.now() - render.stringifyEnd
      const layoutStarted = performance.now()
      render.initialPreviewHeight = markdownBody.parentElement.scrollHeight
      render.forcedLayoutMs = performance.now() - layoutStarted
      render.effectsStarted = performance.now()
      const check = () => {
        const elapsed = performance.now() - render.effectsStarted
        const counts = {
          math: markdownBody.querySelectorAll('.katex').length,
          highlight: markdownBody.querySelectorAll('pre>code.language-js.hljs')
            .length,
          mermaid: markdownBody.querySelectorAll('.bytemd-mermaid svg').length,
        }
        for (const kind of ['math', 'highlight', 'mermaid']) {
          const target = profile === 'core' ? 0 : fixture.expected[kind]
          if (counts[kind] === target && render[`${kind}ReadyMs`] === undefined)
            render[`${kind}ReadyMs`] = round(elapsed)
        }
        if (
          ['math', 'highlight', 'mermaid'].every(
            (kind) => render[`${kind}ReadyMs`] !== undefined
          )
        ) {
          render.pluginsSettleMs = elapsed
          current.counts = counts
          current.readyAt = performance.now()
          current.endToEndMs = round(current.readyAt - current.started)
          if (current.lastKeyAt)
            current.lastKeyToPreviewMs = round(
              current.readyAt - current.lastKeyAt
            )
          current.resolve()
          changes.disconnect()
        }
      }
      const changes = new MutationObserver(check)
      changes.observe(markdownBody, {
        childList: true,
        subtree: true,
        attributes: true,
      })
      queueMicrotask(check)
      return () => changes.disconnect()
    },
  }

  async function finish(current: any, destroy = true, save = true) {
    let timer: ReturnType<typeof setTimeout>
    try {
      await Promise.race([
        current.ready,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Preview readiness timeout (120s)')),
            120000
          )
        }),
      ])
    } finally {
      clearTimeout(timer!)
    }
    await frame()
    await frame()
    const ended = performance.now()
    // A mount starts inside an existing animation-frame task. Include tasks
    // overlapping the sample instead of dropping that task's earlier start.
    const entries = longTasks.filter(
      (task) =>
        task.startTime + task.duration > current.started &&
        task.startTime < ended
    )
    current.longTasks = entries.map((task) => ({
      startMs: round(task.startTime - current.started),
      durationMs: round(task.duration),
    }))
    current.longTaskCount = entries.length
    current.maxLongTaskMs = round(
      Math.max(0, ...entries.map((task) => task.duration))
    )
    current.totalBlockingMs = round(
      entries.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0)
    )
    current.domNodes = sandbox.querySelectorAll('*').length
    current.previewNodes =
      sandbox.querySelector('.markdown-body')?.querySelectorAll('*').length ?? 0
    current.heapReady = heap()
    current.renders = current.renders.map(
      ({ parseStarted, stringifyEnd, effectsStarted, ...render }: any) =>
        Object.fromEntries(
          Object.entries(render).map(([key, value]) => [
            key,
            typeof value === 'number' ? round(value) : value,
          ])
        )
    )
    if (destroy) {
      const started = performance.now()
      component.$destroy()
      component = undefined
      current.destroyMs = round(performance.now() - started)
      await frame()
      await frame()
      current.domNodesAfterDestroy = sandbox.querySelectorAll('*').length
      current.heapAfterDestroy = heap()
    }
    delete current.resolve
    delete current.ready
    delete current.started
    delete current.readyAt
    delete current.lastKeyAt
    if (save) results.push(current)
    publish()
  }

  function mount() {
    component?.$destroy()
    const started = performance.now()
    component = new Editor({
      target: sandbox,
      props: {
        value: fixture.markdown,
        mode: 'split',
        previewDebounce: 300,
        plugins: [probe, ...plugins[profile]],
      },
    })
    component.$on('change', (event: any) =>
      component.$set({ value: event.detail.value })
    )
    if (sample) sample.mountCallMs = round(performance.now() - started)
  }

  async function suite() {
    busy = true
    waitingForKeyboard = false
    sample = undefined
    results.length = 0
    publish()
    try {
      for (const nextProfile of ['core', 'enhanced']) {
        profile = nextProfile
        size = 10
        fixture = performanceFixture(size, profile === 'enhanced')
        status = `${profile}：模块预热`
        let current = begin('warmup-mount')
        mount()
        await finish(current)
        for (const nextSize of [10, 100, 500]) {
          size = nextSize
          fixture = performanceFixture(size, profile === 'enhanced')
          for (let iteration = 1; iteration <= 3; iteration++) {
            status = `${profile} / ${size} KiB：挂载 ${iteration}/3`
            await frame()
            current = begin('mount')
            mount()
            await finish(current)
          }
          status = `${profile} / ${size} KiB：准备编辑`
          current = begin('edit-setup')
          mount()
          await finish(current, false, false)
          for (let iteration = 1; iteration <= 3; iteration++) {
            status = `${profile} / ${size} KiB：编辑 ${iteration}/3`
            await frame()
            current = begin('api-edit')
            const started = performance.now()
            codeMirror.replaceRange('x', { line: codeMirror.lastLine(), ch: 0 })
            current.editCallMs = round(performance.now() - started)
            await finish(current, iteration === 3)
          }
        }
      }
      status = '完整基线测量完成'
    } catch (error) {
      status = String(error)
      component?.$destroy()
      component = undefined
    } finally {
      busy = false
      sample = undefined
      publish()
    }
  }

  async function keyboardSetup() {
    busy = true
    waitingForKeyboard = false
    fixture = performanceFixture(Number(size), profile === 'enhanced')
    const current = begin('keyboard-setup')
    mount()
    await finish(current, false, false)
    sample = undefined
    waitingForKeyboard = true
    status = '准备完成：点击编辑区，输入 abcde；预览完成后点击“保存键盘测量”'
    busy = false
  }

  async function pluginSuite(paired = false) {
    busy = true
    waitingForKeyboard = false
    component?.$destroy()
    component = undefined
    profile = 'enhanced'
    fixture = performanceFixture(Number(size), true)
    status = '插件专项：准备 HTML（解析不计入插件样本）'
    try {
      const file = getProcessor({ plugins: plugins.enhanced }).processSync(
        fixture.markdown
      )
      // Warm the shared highlighter outside all measured samples.
      const warmBody = document.createElement('div')
      warmBody.innerHTML =
        '<pre><code class="language-js">const warm = 1</code></pre>'
      sandbox.appendChild(warmBody)
      const stopWarm = runViewerEffects(warmBody, file, [plugins.enhanced[1]])
      await highlightReady
      stopWarm()
      warmBody.remove()
      // Alternate order within pairs; both variants reuse the same prepared HTML.
      const modes = paired
        ? [true, false, false, true, true, false]
        : [false, false, false]
      for (const [index, control] of modes.entries()) {
        profile = control ? 'enhanced-control' : 'enhanced'
        status = `插件专项 / ${size} KiB / ${profile}：${index + 1}/${
          modes.length
        }`
        const body = document.createElement('div')
        body.className = 'markdown-body'
        body.innerHTML = String(file)
        sandbox.appendChild(body)
        addCopyButtons(body)
        void body.scrollHeight
        await frame()
        await frame()
        const current = begin('plugins-only')
        const render = {
          parseMs: 0,
          transformMs: 0,
          stringifyMs: 0,
          stringifyEnd: performance.now(),
        }
        current.renders.push(render)
        file.data.performanceProbe = render
        const stop = runViewerEffects(body, file, [
          probe,
          ...(control ? controlPlugins : plugins.enhanced),
        ])
        await finish(current, false)
        const started = performance.now()
        stop()
        body.remove()
        current.destroyMs = round(performance.now() - started)
        current.domNodesAfterDestroy = sandbox.querySelectorAll('*').length
        current.heapAfterDestroy = heap()
      }
      status = '插件专项测量完成'
    } catch (error) {
      status = String(error)
    } finally {
      busy = false
      sample = undefined
      publish()
    }
  }

  async function keyboardSave() {
    if (sample?.operation !== 'keyboard-burst') return
    busy = true
    waitingForKeyboard = false
    await finish(sample)
    sample = undefined
    busy = false
    status = '键盘测量已保存'
  }

  const errorHandler = (event: any) => {
    sample?.errors.push({
      plugin: event.detail.plugin,
      error: String(event.detail.error),
    })
    status = `${event.detail.plugin}: ${String(event.detail.error)}`
  }
</script>

<main>
  <h1>长文档端到端测量</h1>
  <p>
    固定文档与插件密度；每种规模记录 3 次挂载、3 次编辑。输入延迟包含默认 300ms
    防抖。
  </p>
  <div class="controls">
    <label>结果标签 <input bind:value={label} disabled={busy} /></label>
    <button on:click={suite} disabled={busy}>运行完整基线</button>
    <button on:click={() => pluginSuite()} disabled={busy}>运行插件专项</button>
    <button on:click={() => pluginSuite(true)} disabled={busy}
      >运行调度对照</button
    >
    <label
      >规模 <select bind:value={size} disabled={busy}
        ><option value={10}>10 KiB</option><option value={100}>100 KiB</option
        ><option value={500}>500 KiB</option></select
      ></label
    >
    <label
      >插件 <select bind:value={profile} disabled={busy}
        ><option value="core">core</option><option value="enhanced"
          >enhanced</option
        ></select
      ></label
    >
    <button on:click={keyboardSetup} disabled={busy}>准备真实输入</button>
    <button on:click={keyboardSave} disabled={busy || !waitingForKeyboard}
      >保存键盘测量</button
    >
  </div>
  <p role="status">{status}</p>
  <div bind:this={sandbox} on:bytemd-plugin-error={errorHandler} />
  <label>测量结果 JSON <textarea readonly value={output} rows="8" /></label>
</main>

<style>
  :global(body) {
    margin: 0;
    color: #1f2937;
    background: #f4f6f8;
    font-family: system-ui, sans-serif;
  }
  main {
    margin: 16px auto;
    max-width: 1160px;
    padding: 0 16px;
  }
  h1 {
    font-size: 24px;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  input,
  select,
  button {
    padding: 5px;
  }
  textarea {
    display: block;
    width: 100%;
  }
  :global(.bytemd) {
    height: 480px;
  }
</style>
