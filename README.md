# ByteMD

> Fork of [pd4d10/bytemd](https://github.com/pd4d10/bytemd), maintained by [bigJiHua](https://github.com/bigJiHua) with custom modifications. 基于 ByteMD v1 定制开发。

> This is ByteMD v1 repository.
>
> v2 is under development actively, see [HashMD](https://github.com/pd4d10/hashmd).

ByteMD is a Markdown editor component built with Svelte. It could also be used in other libraries/frameworks such as React, Vue and Angular.

Playground: run `pnpm dev` at the repository root.

## Features

1. **Lightweight and framework agnostic**: ByteMD is built with [Svelte](https://svelte.dev/). It compiles to vanilla JS DOM manipulation without importing any UI Framework runtime bundle, which makes it lightweight, and easily adapted to other libraries/frameworks.
2. **Easy to extend**: ByteMD has a plugin system to extend the basic Markdown syntax, which makes it easy to add additional features such as code syntax highlight, math equation and [Mermaid](https://mermaid-js.github.io/mermaid/) flowcharts. You can also [write your own plugin](#write-a-plugin) if these ones don't meet your needs.
3. **Secure by default**: [Cross-site scripting(XSS)](https://en.wikipedia.org/wiki/Cross-site_scripting) attack such as `<script>` and `<img onerror>` have been correctly handled by ByteMD. No need to introduce extra DOM sanitize steps.
4. **SSR compatible**: ByteMD could be used in the [Server-side rendering(SSR)](https://ssr.vuejs.org/) environment without extra config. SSR is widely used in some cases due to its better SEO and fast time-to-content in slow network connection.

## Installation

| Package | Status | Description |
| --- | --- | --- |
| [bytemd](https://github.com/bytedance/bytemd/tree/main/packages/bytemd) | [![npm](https://img.shields.io/npm/v/bytemd?label=)](https://npm.im/bytemd) | Svelte/Vanilla JS component |
| [@bytemd/react](https://github.com/bytedance/bytemd/tree/main/packages/react) | [![npm](https://img.shields.io/npm/v/@bytemd/react.svg?label=)](https://npm.im/@bytemd/react) | React component |
| [@bytemd/vue](https://github.com/bytedance/bytemd/tree/main/packages/vue) | [![npm](https://img.shields.io/npm/v/@bytemd/vue.svg?label=)](https://npm.im/@bytemd/vue) | Vue 2 component |
| [@bytemd/vue-next](https://github.com/bytedance/bytemd/tree/main/packages/vue-next) | [![npm](https://img.shields.io/npm/v/@bytemd/vue-next.svg?label=)](https://npm.im/@bytemd/vue-next) | Vue 3 component |

### Legacy browsers support

The published packages ship ESM and CJS only; the UMD and ES5 bundles were retired. To support legacy browsers, bundle the npm package with your own toolchain and transpile it with ESNext -> ES5 compilers such as [Babel](https://babeljs.io/) or [SWC](https://swc.rs/), then add the polyfills your targets require — polyfills are not included.

## Usage

There are two components: `Editor` and `Viewer`. `Editor` is the Markdown editor, as the name suggests; `Viewer` is commonly used to display rendered Markdown results without editing.

Before using the component, remember to import CSS file to make styles correct:

```js
import 'bytemd/dist/index.css'
// Optional standard Markdown theme (typography, tables, code, callouts, etc.)
import 'bytemd/dist/markdown.css'
```

### Svelte

```svelte
<script>
  import { Editor, Viewer } from 'bytemd'
  import gfm from '@bytemd/plugin-gfm'

  let value
  const plugins = [
    gfm(),
    // Add more plugins here
  ]

  function handleChange(e) {
    value = e.detail.value
  }
</script>

<template>
  <Editor {value} {plugins} on:change={handleChange} />
</template>
```

### React

```js
import gfm from '@bytemd/plugin-gfm'
import { Editor, Viewer } from '@bytemd/react'

const plugins = [
  gfm(),
  // Add more plugins here
]

const App = () => {
  const [value, setValue] = useState('')

  return (
    <Editor
      value={value}
      plugins={plugins}
      onChange={(v) => {
        setValue(v)
      }}
    />
  )
}
```

### Vue

```vue
<template>
  <Editor :value="value" :plugins="plugins" @change="handleChange" />
</template>

<script>
import gfm from '@bytemd/plugin-gfm'
import { Editor, Viewer } from '@bytemd/vue'

const plugins = [
  gfm(),
  // Add more plugins here
]

export default {
  components: { Editor },
  data() {
    return { value: '', plugins }
  },
  methods: {
    handleChange(v) {
      this.value = v
    },
  },
}
</script>
```

### Vanilla JS

```js
import gfm from '@bytemd/plugin-gfm'
import { Editor, Viewer } from 'bytemd'

const plugins = [
  gfm(),
  // Add more plugins here
]

const editor = new Editor({
  target: document.body, // DOM to render
  props: {
    value: '',
    plugins,
  },
})

editor.$on('change', (e) => {
  editor.$set({ value: e.detail.value })
})
```

## Options

### Viewer

| Key | Type | Description |
| --- | --- | --- |
| `value` | `string` (required) | Markdown text |
| `plugins` | `BytemdPlugin[]` | ByteMD plugin list |
| `sanitize` | `(schema: Schema) => Schema` | Sanitize strategy |
| `remarkRehype` | [documentation](https://github.com/remarkjs/remark-rehype#options) | remark-rehype config options |
| `locale` | `Partial<BytemdLocale>` | Viewer copy, pending and render-error feedback strings |
| `renderer` | `BytemdRenderer` | Optional asynchronous renderer; defaults to synchronous rendering |

Svelte, React, Vue 2 and Vue 3 Viewers all add a copy button and language label to code blocks after mounting and after content updates. This uses the shared `addCopyButtons` and `copyCodeFromButton` helpers exported by `bytemd`; plugins are optional. Import `bytemd/dist/markdown.css` for the button and code header styles.

Viewer accepts `locale` for `copy`, `copySuccess`, `copyFailed` and `renderError` feedback. Failed renders clear the old preview and plugin effects, show an alert, and recover on the next successful render. Copy permission or fallback failures show failure feedback instead of claiming success. Vue 2/3 Editors destroy the core instance on unmount and reset removed optional props.

Built-in inline style ranges are limited to 64 nested ranges and 10,000 generated nodes per inline parent. Exceeding that budget preserves the original inline Markdown nodes and literal markers. Before built-in transforms, Markdown ASTs exceeding depth 128 or 100,000 nodes degrade to literal document text. These checks protect recursive transforms; they do not bound initial parsing time, HTML parsing or trusted plugin execution. `maxLength` remains a warning; hosts accepting large/external documents must use separate input and execution budgets.

`previewDebounce` updates rebuild and cancel the old scheduler; editor unmount cancels pending preview/refresh tasks and layout subscriptions. Async editor actions can check `context.isDestroyed()` before editing. The mediumZoom plugin shares one underlying controller per document and keeps each Viewer's image membership, options, UI and cleanup separate; a page has at most one open zoomed image.

Editor scroll sync matches surviving preview blocks by source identity, including blocks nested inside DOM plugin wrappers. Geometry is cached until content, image load/error, accordion toggle, font loading, observed dimensions or DOM mutations invalidate it. Sync pauses while the editor leads its debounced preview; unusable geometry, duplicate/reordered identities or a preview without surviving source blocks safely disable mapping. The table of contents uses these same source identities, honors CSS scroll margins/padding, ignores plugin-inserted nested headings and clears after render failure.

DOM plugins replacing an Editor preview block should copy its `data-bytemd-block` attribute to the replacement, as Mermaid does. Wrapping and removing blocks need no special handling. Do not duplicate or manufacture these identifiers; they are internal to each render. Standalone Viewers and `getProcessor()` HTML do not include this metadata. This improves mapping reliability and avoids repeated geometry reads while scrolling; whole-document parsing and long-document performance remain separate optimization work.

Svelte, React, Vue 2 and Vue 3 Viewers share DOM plugin error feedback. Plugins can call `reportError(error, { plugin, element })` from their `viewerEffect` context; the Viewer inserts a local alert using `locale.pluginError` and emits a bubbling `bytemd-plugin-error` DOM event. Its detail contains `{ error, plugin, element, file }`; raw diagnostics are available to the host and are not inserted into the alert. Reports from a previous render or an unmounted Viewer are ignored, and feedback is removed on update/cleanup. Synchronous effect failures are isolated so remaining plugins still run. Custom plugins must restore their own partial changes and catch asynchronous failures before reporting them; returning a Promise from `viewerEffect` is not supported.

Mermaid serializes each configuration with its awaited render across this plugin module's Viewers, preserves source on failure, uses unique diagram IDs and cleans up staging/replacement nodes. Its automatic page scan and built-in error diagram are disabled. KaTeX enables and catches parse errors internally (including unknown commands), overriding `katexOptions.throwOnError` so invalid expressions retain their source and receive feedback. KaTeX and highlight preserve source on local failure and continue processing other blocks; highlight waits for its shared asynchronous initialization before using the library. Successful math/highlight transformations restore source during cleanup so locale changes can safely restart effects. A failed library load is not retained in the plugin's loader cache, but network recovery/retry policy remains the browser's responsibility. Direct host calls to Mermaid's global `initialize`/`render` need their own coordination with plugin rendering.

KaTeX and highlight yield to the browser between batches after approximately 8ms of work, using `scheduler.yield()` where available and a cancellable timer fallback elsewhere. Updates and unmounting stop pending work; a native yield may still resume, but its stale nodes are ignored. One expression or code block can exceed the soft budget. Markdown parsing and AST/HTML conversion remain synchronous, so batching alone does not remove long-document blocking. See [the measured performance baseline and Worker plan](./audit/PERFORMANCE.md).

Rehype plugins run after sanitization and must be trusted, as must custom sanitizer strategies.

#### Optional Worker rendering

All four framework Editors and Viewers accept `renderer`. Use `createWorkerRenderer` with a host-created module Worker that calls `installWorkerRenderer` from `bytemd/worker`. The pure `bytemd/processor` entry exports `getProcessor` and `renderMarkdown` without UI/CSS imports. Default rendering stays synchronous; opt-in async SSR shows pending and starts after mounting.

Parser functions cannot be transferred: unknown remark/rehype/sanitize/handlers callbacks keep the synchronous compatibility path. Register known parser configurations inside the Worker and map every callback, order and option explicitly; DOM effects stay on the main thread. New requests abort old ones, ignore late results and clear stale preview/TOC state. A shared renderer belongs to the host, which calls `destroy()` when all consumers are finished. Default queue strategy preserves an active parse; restart strategy terminates it and pays startup costs. Startup/active timeout defaults to 60 seconds.

Vite 4 module Workers need `resolve.conditions: ['worker']` for the DOM-free entity decoder and `worker.format: 'es'` for code splitting. Worker URL and CSP remain host configuration. See [runnable examples, lifecycle contracts and measured results](./audit/WORKER.md). Worker reduces main-thread parsing blockage; large DOM insertion/layout and CodeMirror work can still stall input.

### Editor

`Editor` component also accepts the options of `Viewer` for preview. Besides that, there are some other options:

| Key | Type | Description |
| --- | --- | --- |
| `mode` | `split`, `tab`, `auto` | Editor display mode, default: `auto` |
| `previewDebounce` | `number` | Debounce time (ms) for preview, default: `300` |
| `layoutContainment` | `boolean` | Opt-in intrinsic-size isolation for fixed-height editors, default: `false`. Reduces typing-related layout beside large previews. Keep disabled for content-sized or expanding print layouts. |
| `placeholder` | `string` | Editor placeholder |
| `editorConfig` | [documentation](https://codemirror.net/doc/manual.html#config) | CodeMirror editor config |
| `locale` |  | i18n locale. Available locales could be found at `bytemd/locales`, default: use `en.json` |
| `uploadImages` | `function` | Specify how to upload images. If set, the image icon will appear on the toolbar |
| `overridePreview` | `(el, props) => void` | Replace built-in preview rendering; forwarded by all Editor wrappers |
| `maxLength` | `number` | Warning threshold for `value.length` (UTF-16 code units), default: `Infinity`. Shows an over-limit indicator; input and pasted text are accepted without truncation. |

The editor emits the complete Markdown through `change`. The host must update `value` to keep the editor and preview in sync, and validate the length before saving if a hard limit is required. Preview rendering is debounced by `previewDebounce` (300 ms by default).

### Style customization

#### Editor

The default height of ByteMD Editor is `300px`. It could be overridden by CSS:

```css
.bytemd {
  height: calc(100vh - 200px);
}
```

The other styles could also be overridden, see [the default style](https://github.com/bytedance/bytemd/blob/main/packages/bytemd/src/index.scss).

#### Viewer

A standard Markdown theme is shipped as an optional stylesheet: `bytemd/dist/markdown.css`. It covers the core Markdown syntax plus the built-in callout, accordion, pinyin and timeline syntaxes, and exposes `--md-*` CSS variables for host-level color and spacing overrides. Import it after `bytemd/dist/index.css`:

```js
import 'bytemd/dist/index.css'
import 'bytemd/dist/markdown.css'
```

You can still use third-party Markdown themes instead, for example [juejin-markdown-themes](https://github.com/xitu/juejin-markdown-themes) and [github-markdown-css](https://github.com/sindresorhus/github-markdown-css).

## Extended Markdown syntax

In addition to standard Markdown and the optional plugins, this fork includes eight built-in syntaxes. All of them are also exposed as toolbar actions and Help cheatsheets.

### Callout

```md
> [warning] 警告内容
```

Supported types: `default`, `success`, `warning`, `info`, `danger` (English and Chinese aliases).

### Accordion

```md
+++ 默认收起
内容
++- 默认展开
内容
++ 默认收起
内容
+++
```

The opening `+++ title` also creates the first item; end the group with a standalone `+++`.

### Pinyin

```md
{拼 音|Ping Yin}
```

Each syllable is capped at 5 characters (for example `zhang`) so the annotation cannot overflow the base text.

### Timeline

```md
::: timeline 时间线 :: [done] 2024-01-15 项目立项 完成需求评审 :: [doing] 2024-03-20 Alpha 版本 正在联调 :: [todo] 2024-06-01 正式上线 :: [error] 2024-07-01 严重回滚事件 :: [milestone] 2024-08-01 用户破万 :::
```

Supported statuses: `done`, `doing`, `todo`, `error`, `milestone`. Entries can also be separated by blank lines.

### Font size

```md
[size=24]这一行按 24px 渲染[/size]

局部放大：[size=32]重点内容[/size] 其余保持默认。
```

Sizes are integers from 8 to 96. The range keeps emphasis, links, inline code and other inline nodes intact, and is rendered as a span with an inline `font-size`, so it survives sanitization and HTML export. Use the **Font size** dropdown in the toolbar to wrap the selection, or the current line when nothing is selected. A range cannot span blank lines or separate block nodes yet.

### Colors

```md
[color=#e03131]红色文字[/color]

[bg=#fff3bf]黄色背景[/bg]
```

Both accept 3, 6 or 8 digit hex values. Use the **Font color** and **Background color** dropdowns in the toolbar to wrap the selection or the current line. Color ranges can be nested with font size and with each other.

### Text divider

```md
---居中文字---
```

A single line of the form `---text---` renders a horizontal rule with the label centered between two lines. The label keeps inline Markdown (emphasis, links, code), inline style ranges and images. Images are capped to an icon-sized box (`max-height: 2em`, `max-width: 8em`) so a divider like `---![icon](./icon.svg)---` stays compact. Divider images are excluded from click-to-zoom; normal Markdown images keep their zoom behavior. A plain `---` stays a normal horizontal rule; empty or multi-line ranges are left untouched.

## Plugin System

ByteMD provides a powerful plugin system for customization. There are several official plugins to support features such as code syntax highlight, math equation and Mermaid flowcharts.

If you have more customized needs, you could also write your own plugin to support them.

### Official Plugins

<!-- bytemd:plugins:start -->

| Package | Status | Description |
| --- | --- | --- |
| [@bytemd/plugin-breaks](https://github.com/bigJiHua/bytemd/tree/main/packages/plugin-breaks) | [![npm](https://img.shields.io/npm/v/@bytemd/plugin-breaks.svg?label=)](https://npm.im/@bytemd/plugin-breaks) | Support breaks |
| [@bytemd/plugin-frontmatter](https://github.com/bigJiHua/bytemd/tree/main/packages/plugin-frontmatter) | [![npm](https://img.shields.io/npm/v/@bytemd/plugin-frontmatter.svg?label=)](https://npm.im/@bytemd/plugin-frontmatter) | Parse frontmatter |
| [@bytemd/plugin-gemoji](https://github.com/bigJiHua/bytemd/tree/main/packages/plugin-gemoji) | [![npm](https://img.shields.io/npm/v/@bytemd/plugin-gemoji.svg?label=)](https://npm.im/@bytemd/plugin-gemoji) | Support Gemoji shortcodes |
| [@bytemd/plugin-gfm](https://github.com/bigJiHua/bytemd/tree/main/packages/plugin-gfm) | [![npm](https://img.shields.io/npm/v/@bytemd/plugin-gfm.svg?label=)](https://npm.im/@bytemd/plugin-gfm) | Support GFM (autolink literals, strikethrough, tables, tasklists) |
| [@bytemd/plugin-highlight](https://github.com/bigJiHua/bytemd/tree/main/packages/plugin-highlight) | [![npm](https://img.shields.io/npm/v/@bytemd/plugin-highlight.svg?label=)](https://npm.im/@bytemd/plugin-highlight) | Highlight code blocks |
| [@bytemd/plugin-highlight-ssr](https://github.com/bigJiHua/bytemd/tree/main/packages/plugin-highlight-ssr) | [![npm](https://img.shields.io/npm/v/@bytemd/plugin-highlight-ssr.svg?label=)](https://npm.im/@bytemd/plugin-highlight-ssr) | Highlight code blocks (SSR compatible) |
| [@bytemd/plugin-math](https://github.com/bigJiHua/bytemd/tree/main/packages/plugin-math) | [![npm](https://img.shields.io/npm/v/@bytemd/plugin-math.svg?label=)](https://npm.im/@bytemd/plugin-math) | Support math formula |
| [@bytemd/plugin-math-ssr](https://github.com/bigJiHua/bytemd/tree/main/packages/plugin-math-ssr) | [![npm](https://img.shields.io/npm/v/@bytemd/plugin-math-ssr.svg?label=)](https://npm.im/@bytemd/plugin-math-ssr) | Support math formula (SSR compatible) |
| [@bytemd/plugin-medium-zoom](https://github.com/bigJiHua/bytemd/tree/main/packages/plugin-medium-zoom) | [![npm](https://img.shields.io/npm/v/@bytemd/plugin-medium-zoom.svg?label=)](https://npm.im/@bytemd/plugin-medium-zoom) | Zoom images like Medium |
| [@bytemd/plugin-mermaid](https://github.com/bigJiHua/bytemd/tree/main/packages/plugin-mermaid) | [![npm](https://img.shields.io/npm/v/@bytemd/plugin-mermaid.svg?label=)](https://npm.im/@bytemd/plugin-mermaid) | Support Mermaid diagram |

<!-- bytemd:plugins:end -->

### Technical Overview

ByteMD uses [remark](https://github.com/remarkjs/remark) and [rehype](https://github.com/rehypejs/rehype) ecosystem to process Markdown. The complete process is as follows:

1. The markdown text is parsed to an [AST](https://github.com/syntax-tree/mdast)
2. The Markdown AST could be manipulated by several [remark plugins](https://github.com/remarkjs/remark/blob/main/doc/plugins.md)
3. The Markdown AST is transformed to a HTML AST
4. The HTML AST is sanitized for security reason
5. The HTML AST could be manipulated by several [rehype plugins](https://github.com/rehypejs/rehype/blob/main/doc/plugins.md)
6. The HTML AST is stringified to HTML
7. Some extra DOM manipulation after the HTML being rendered

It could also be described as a flowchart:

![plugin system](https://raw.githubusercontent.com/bytedance/bytemd/main/assets/plugin.svg)

The 2,5,7 steps are designed for user customization via ByteMD plugin API.

### Authoring a Plugin

We'll take Math formula plugin as an example to walk you through the process.

First of all, scaffold the project according to the `BytemdPlugin` type signature:

```ts
import type { BytemdPlugin } from 'bytemd'

export default function mathPlugin(): BytemdPlugin {
  return {
    // to be implement
  }
}
```

Then we look into the requirement more closely: If we want to render syntax like `$a+b$` to Math formula, there are several things we need to do:

- Support `$a+b$` syntax as a Math formula in Markdown (step 2)
- Render these nodes correctly in HTML (step 5 or 7)
- Additionally, an extra icon in the toolbar would be great for user convenience

For the first thing, luckily, we don't need to implement it with our own because [remark-math](https://github.com/remarkjs/remark-math) already did it. The only thing we need to do is to import and use it:

```diff
import type { BytemdPlugin } from 'bytemd'
+import remarkMath from 'remark-math'

export default function mathPlugin(): BytemdPlugin {
  return {
-    // to be implement
+    remark: (processor) => processor.use(remarkMath),
  }
}
```

Then consider the second thing, it would be a little complicated because we have two choices, do it in step 5 or 7. The difference is that step 5 is more friendly with SSR, while step 7 hand over the rendering to the client-side. This is why we have two plugin: [@bytemd/plugin-math](https://github.com/bytedance/bytemd/tree/main/packages/plugin-math) and [@bytemd/plugin-math-ssr](https://github.com/bytedance/bytemd/tree/main/packages/plugin-math-ssr).

```diff
// if we choose step 5:
import type { BytemdPlugin } from 'bytemd'
import remarkMath from 'remark-math'
+import rehypeKatex from 'rehype-katex'

export default function mathPlugin(): BytemdPlugin {
  return {
    remark: (processor) => processor.use(remarkMath),
+   rehype: (processor) => processor.use(rehypeKatex),
  }
}

// if we choose step 7:
import type { BytemdPlugin } from 'bytemd'
import remarkMath from 'remark-math'
+import rehypeKatex from 'rehype-katex'

export default function mathPlugin(): BytemdPlugin {
  return {
    remark: (processor) => processor.use(remarkMath),
+   viewerEffect({ markdownBody }) {
+     const renderMath = async (selector: string, displayMode: boolean) => {
+       const katex = await import('katex').then((m) => m.default)
+
+       const els = markdownBody.querySelectorAll<HTMLElement>(selector)
+       els.forEach((el) => {
+         katex.render(el.innerText, el, { displayMode })
+       })
+     }
+
+     renderMath('.math.math-inline', false)
+     renderMath('.math.math-display', true)
+   },
  }
}
```

The last thing is to add an icon to the toolbar. we use the `actions` prop to implement it:

```ts
export default function mathPlugin(): BytemdPlugin {
  return {
    actions: [
      {
        title: 'Insert an math formula',
        icon: '', // 16x16 SVG icon
        handler: {
          type: 'action',
          click(ctx) {
            // to be implement:
            // the `ctx` is an instance of `BytemdEditorContext`, which has
            // several utility methods to help operate the CodeMirror editor state.

            // remember to call `focus` to avoid lost of focus
            editor.focus()
          },
        },
      },
    ],
  }
}
```

Now we have completed a minimalist version of the plugin! For more details and references please check out the source code.

## Local development

This is a pnpm workspace with Svelte 3, TypeScript, CodeMirror 5 and the unified/remark/rehype rendering pipeline. Run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm generate
pnpm generate:check
pnpm test:scripts
pnpm exec vitest run --threads false
pnpm build
pnpm dev
```

`pnpm install` no longer runs a root `postinstall` that rewrites workspace files. Run `pnpm generate` explicitly after adding packages or changing generated entries; it fills missing package/TypeScript defaults, prepares package licenses, and updates only the `bytemd:plugins` regions in the three shared READMEs. Existing metadata, custom configuration and unmarked plugin READMEs are preserved; marked plugin READMEs update only `bytemd:usage`. `pnpm generate:check` is read-only and exits with code 1 when generation is needed. CI explicitly checks generation and Git differences; `pnpm pub` prepares and checks before building and publishing.

Run `pnpm format` separately. The raw `playground/src/text.md` render fixture is excluded because generic Markdown formatting changes custom block syntax and intentional long code lines. Historical audit JSON is also excluded. Keep customized plugin instructions outside generation markers; see `audit/GENERATING.md` in the repository for the scope and verified results.

The playground imports workspace package entries: the core JavaScript uses the generated `svelte/` entry under Svelte resolution, plugins use `dist/`, and theme styles use `dist/*.css`. Rebuild with `pnpm build` after source changes. If the running dev server still shows cached output or reports missing generated modules during build cleanup, restart it with `pnpm --filter playground dev --force` to reload optimized dependencies. Vitest aliases `bytemd` directly to source so the core and framework Viewer tests exercise current changes.

`pnpm clean` uses `scripts/clean.mjs` to remove package build outputs on Windows, macOS and Linux without requiring Unix shell commands.

When adding or changing a built-in syntax, keep these parts in sync:

1. Parsing and sanitization in `packages/bytemd/src/processor.ts`, with rendering tests for valid, invalid and unsafe input; DOM helpers remain in `utils.ts`.
2. Toolbar actions in `editor.ts`, icons and the Help cheatsheet generated from those actions.
3. Styles in `markdown.scss`, including dark theme tokens where appropriate.
4. Locale keys and types in `locales/en.json`, `locales/zh_Hans.json` and `types.ts`; other locales fall back to English.
5. Examples in `playground/src/text.md`, this README, `docs/index.md` and `packages/bytemd/README.md`.
6. DOM behavior in the Svelte, React, Vue 2 and Vue 3 Viewers when the feature runs after rendering. Use the shared Viewer contract tests to verify mounting, updates and cleanup.

Run the test suite, build all packages and smoke-test the playground after each batch. UMD/CJS format changes and major dependency migrations remain separate stages in the repository's `PLAN.md`.

## Contributors

[![](https://contrib.rocks/image?repo=bytedance/bytemd)](https://github.com/bytedance/bytemd/graphs/contributors)

## License

MIT

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fbytedance%2Fbytemd.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fbytedance%2Fbytemd?ref=badge_large)
