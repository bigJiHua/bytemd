<script lang="ts">
  // ByteMD is imported from source so it compiles with this playground's Svelte
  // runtime. `bytemd/dist` bundles its own runtime copy, and components
  // rendered by a host runtime never run that copy's `init_operations`.
  import { EditorComponent as Editor } from '../../packages/bytemd/src'
  import markdownText from './text.md?raw'
  import breaks from '@bytemd/plugin-breaks'
  import frontmatter from '@bytemd/plugin-frontmatter'
  import gemoji from '@bytemd/plugin-gemoji'
  import gfm from '@bytemd/plugin-gfm'
  import highlight from '@bytemd/plugin-highlight'
  import math from '@bytemd/plugin-math'
  import mediumZoom from '@bytemd/plugin-medium-zoom'
  import mermaid from '@bytemd/plugin-mermaid'
  import 'bytemd/dist/index.css'
  import 'bytemd/dist/markdown.css'
  import hljsDarkUrl from 'highlight.js/styles/github-dark.css?url'
  // Load the matching highlight.js theme for the active palette via <link>
  // (below) so dark mode swaps the token colors instead of hardcoding white.
  import hljsLightUrl from 'highlight.js/styles/github.css?url'
  // placed after highlight styles to override `code` padding
  import 'katex/dist/katex.css'

  function stripPrefixes(obj: Record<string, any>) {
    return Object.entries(obj).reduce(
      (p, [key, value]) => {
        p[key.split('/').slice(-1)[0].replace('.json', '')] = value
        // console.log(p)
        return p
      },
      {} as Record<string, any>,
    )
  }

  const locales = stripPrefixes(
    import.meta.glob('/node_modules/bytemd/locales/*.json', { eager: true }),
  )
  const gfmLocales = stripPrefixes(
    import.meta.glob('/node_modules/@bytemd/plugin-gfm/locales/*.json', {
      eager: true,
    }),
  )
  const mathLocales = stripPrefixes(
    import.meta.glob('/node_modules/@bytemd/plugin-math/locales/*.json', {
      eager: true,
    }),
  )
  const mermaidLocales = stripPrefixes(
    import.meta.glob('/node_modules/@bytemd/plugin-mermaid/locales/*.json', {
      eager: true,
    }),
  )

  let value = markdownText
  let mode = 'auto'
  let localeKey = 'en'
  let dark = false

  $: hljsThemeHref = dark ? hljsDarkUrl : hljsLightUrl

  function toggleTheme() {
    dark = !dark
    document.documentElement.classList.toggle('dark', dark)
  }
  let maxLength: number

  let enabled = {
    breaks: false,
    frontmatter: true,
    gemoji: true,
    gfm: true,
    highlight: true,
    math: true,
    'medium-zoom': true,
    mermaid: true,
  }

  $: plugins = [
    enabled.breaks && breaks(),
    enabled.frontmatter && frontmatter(),
    enabled.gemoji && gemoji(),
    enabled.gfm &&
      gfm({
        locale: gfmLocales[localeKey],
      }),
    enabled.highlight && highlight(),
    enabled.math &&
      math({
        locale: mathLocales[localeKey],
        katexOptions: { output: 'html' }, // https://github.com/KaTeX/KaTeX/issues/2796
      }),
    enabled['medium-zoom'] && mediumZoom(),
    enabled.mermaid &&
      mermaid({
        locale: mermaidLocales[localeKey],
      }),
  ].filter((x) => x)

  $: activePlugins = Object.entries(enabled)
    .filter(([, v]) => v)
    .map(([k]) => k)
</script>

<svelte:head>
  <link rel="stylesheet" href={hljsThemeHref} />
</svelte:head>

<div class="container">
  <div class="line">
    Mode:
    {#each ['auto', 'split', 'tab'] as m}
      <label> <input type="radio" bind:group={mode} value={m} />{m}</label>
    {/each}
    , Locale:
    <select bind:value={localeKey}>
      {#each Object.keys(locales) as l}
        <option value={l}>{l}</option>
      {/each}
    </select>
    , Max length:
    <input bind:value={maxLength} type="number" />
  </div>
  <div class="line">
    <button on:click={toggleTheme}>Theme: {dark ? 'dark' : 'light'}</button>
  </div>
  <div class="line">
    Plugins:
    {#each Object.keys(enabled) as p}
      {' '}
      <label> <input type="checkbox" bind:checked={enabled[p]} />{p}</label>
    {/each}
  </div>

  <div class="badges">
    已启用：
    {#each activePlugins as p, i}
      {#if i > 0}<span class="sep">·</span>{/if}<span class="badge">{p}</span>
    {/each}
  </div>

  <Editor
    {value}
    {mode}
    {plugins}
    {maxLength}
    placeholder={'Start writing with ByteMD'}
    locale={locales[localeKey]}
    uploadImages={(files) => {
      return Promise.all(
        files.map((file) => {
          // TODO:
          return {
            url: 'https://picsum.photos/300',
          }
        }),
      )
    }}
    on:change={(e) => {
      value = e.detail.value
    }}
  />
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    position: relative;
  }
  .badges {
    position: absolute;
    top: 46px;
    left: 12px;
    z-index: 20;
    pointer-events: none;
    font-size: 12px;
    line-height: 20px;
    color: #57606a;
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(4px);
    padding: 2px 10px;
    border-radius: 12px;
  }
  .badge {
    display: inline-block;
    padding: 0 6px;
    margin: 0 2px;
    background: rgba(9, 105, 121, 0.12);
    border-radius: 9px;
  }
  .sep {
    margin: 0 4px;
    opacity: 0.6;
  }
  .line {
    margin: 10px 0;
    text-align: center;
  }
  :global(body) {
    margin: 0 10px;
    font-size: 14px;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial,
      sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';
  }
  :global(html.dark body) {
    background: #0d1117;
    color: #e6edf3;
  }
  :global(html.dark select),
  :global(html.dark input[type='number']) {
    background: #161b22;
    color: #e6edf3;
    border: 1px solid #30363d;
  }
  :global(html.dark .badges) {
    color: #8b949e;
    background: rgba(22, 27, 34, 0.82);
  }
  :global(html.dark .badge) {
    background: rgba(121, 192, 255, 0.14);
  }
  :global(.bytemd) {
    height: calc(100vh - 100px);
  }
</style>
