<script lang="ts">
  import '../packages/bytemd/dist/markdown.css'
  import en from '../packages/bytemd/locales/en.json'
  import zh from '../packages/bytemd/locales/zh_Hans.json'
  import { Viewer } from '../packages/bytemd/svelte/index.js'
  import highlight from '../packages/plugin-highlight/dist/index.mjs'
  import math from '../packages/plugin-math/dist/index.mjs'
  import '../packages/plugin-math/node_modules/katex/dist/katex.css'
  import mermaid from '../packages/plugin-mermaid/dist/index.mjs'

  const source = (label: string, version = 1) =>
    `## Viewer ${label}\n\n\`\`\`mermaid\ngraph LR\nA[${label} ${version}]-->B[ByteMD]\n\`\`\`\n\n公式：$x^2$\n\n\`\`\`js\nconst value = ${version};\n\`\`\``
  let version = 1
  let valueA = source('A')
  const valueB = source('B')
  let language = 'zh'
  let failHighlight = false
  let events: string[] = []
  $: locale = language === 'zh' ? zh : en
  $: pluginsA = [
    mermaid({ theme: 'dark' }),
    math({ katexOptions: { output: 'html' } }),
    highlight({
      init: () => {
        if (failHighlight) throw new Error('fixture init failure')
      },
    }),
  ]
  const pluginsB = [
    mermaid({ theme: 'forest' }),
    math({ katexOptions: { output: 'html' } }),
    highlight(),
  ]
  const record = (event: CustomEvent) => {
    events = [...events, event.detail.plugin ?? 'Plugin']
  }
</script>

<main>
  <h1>异步插件专项验证</h1>
  <p>两个 Viewer 使用独立主题；左侧可触发失败、更新和恢复。</p>
  <div class="controls">
    <button on:click={() => (valueA = source('A', ++version))}>更新 A</button>
    <button
      on:click={() =>
        (valueA =
          '## Viewer A\n\n```mermaid\ninvalid diagram\n```\n\n```mermaid\ngraph LR\nC[Valid]-->D[Still works]\n```')}
      >错误图表 A</button
    >
    <button
      on:click={() =>
        (valueA = '## Viewer A\n\n公式：$\\unknowncommand$ 和 $x^2$')}
      >错误公式 A</button
    >
    <button
      on:click={() => {
        failHighlight = false
        valueA = source('A', ++version)
      }}>恢复 A</button
    >
    <label
      ><input
        type="checkbox"
        bind:checked={failHighlight}
      />高亮初始化失败</label
    >
    <label
      >语言 <select bind:value={language}
        ><option value="zh">中文</option><option value="en">English</option
        ></select
      ></label
    >
  </div>
  <p role="status">错误事件：{events.length} {events.join(' · ')}</p>
  <div class="viewers">
    <section id="viewer-a" on:bytemd-plugin-error={record}>
      <strong>A / dark</strong><Viewer
        value={valueA}
        plugins={pluginsA}
        {locale}
      />
    </section>
    <section id="viewer-b" on:bytemd-plugin-error={record}>
      <strong>B / forest</strong><Viewer
        value={valueB}
        plugins={pluginsB}
        {locale}
      />
    </section>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f4f6f8;
    font-family: system-ui, sans-serif;
    color: #1f2937;
  }
  main {
    max-width: 1120px;
    margin: 24px auto;
    padding: 0 24px;
  }
  h1 {
    font-size: 24px;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  button,
  select {
    padding: 6px 10px;
  }
  .viewers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  section {
    padding: 18px;
    border: 1px solid #d9dee5;
    border-radius: 8px;
    background: white;
  }
</style>
