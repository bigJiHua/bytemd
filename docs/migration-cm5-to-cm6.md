# Migrating from CodeMirror 5 to CodeMirror 6 (ByteMD 2.x)

ByteMD 2.0 replaces CodeMirror 5 with CodeMirror 6. The plugin contract (`remark`/`rehype`/`actions`/`editorEffect`/`viewerEffect`) is unchanged, but the editor instance is a CM5-shaped adapter over a real CM6 `EditorView`, not a full CM5 `Editor`.

This page lists what is guaranteed, what changed, and how to move a host integration or an out-of-repo plugin.

## Compatibility matrix

| Surface | Status | Notes |
| --- | --- | --- |
| `remark` / `rehype` plugins | Supported | Unchanged |
| `actions(ctx)` without touching `ctx.editor` | Supported | Unchanged |
| `actions(ctx)` using `wrapText`, `replaceLines`, `appendBlock`, `setSelection`, `focus` | Supported | Used by the built-in GFM and Mermaid actions; covered by the browser acceptance scripts |
| `editorEffect(ctx)` setup and cleanup | Supported | Cleanup runs on plugin change and unmount |
| Adapter helpers: `getValue`/`setValue`, `getCursor`/`setCursor`, `getSelection`/`replaceSelection`, `somethingSelected`, `getLine`/`lineCount`, `posFromIndex`/`indexFromPos`, `getRange`/`replaceRange`, `listSelections`, `findWordAt`, `heightAtLine`, `getScrollInfo`, `scrollTo`, `focus`, `refresh`, `addKeyMap`/`removeKeyMap`, `on`/`off` | Supported | Same call shapes as CM5 |
| `codemirror.Pos(line, ch)` | Supported | Keeps the CM5 zero-based line / character signature |
| `getOption('lineNumbers' \| 'lineWrapping' \| 'readOnly' \| 'value')` | Supported | Reflects the effective value, including defaults |
| `getDoc()` | **Changed** | Returns a CM6 `Text` (`lines`, `line(n)`, `toString()`), not a CM5 `Doc` |
| `getDoc().getValue()` / `getDoc().eachLine()` and other CM5 `Doc` methods | **Not supported** | Use `editor.getValue()` or `editor.view.state.doc` |
| `setOption(name, value)` other than `readOnly` | **Not supported at runtime** | The value is recorded but not applied; use `editorExtensions` |
| CM5 option presets (`mode`, `theme`, `keyMap`, `cursorBlinkRate`, …) | **Ignored** | See the `editorConfig` table below |
| `.cm-*` CSS token classes | **Removed** | Override `--bytemd-syntax-*` and `--bytemd-*` instead |
| `state.selectingText` / `state.draggingText` | **Placeholder** | Always `undefined`; do not branch on them |
| Native CM6 extensions | Supported | `editorExtensions` prop, or `editor.view` directly |

## `editorConfig` mapping

| CM5 option | 2.x behaviour |
| --- | --- |
| `lineNumbers` | Mapped (default `true`) |
| `lineWrapping` | Mapped (default `true`) |
| `tabSize` | Mapped |
| `indentUnit` | Mapped |
| `readOnly` | Mapped, switchable via `setOption('readOnly', …)` |
| `extraKeys` | Mapped; CM6 keymap runs first, declined commands fall through to the editor default |
| `autofocus` | Mapped |
| `undoDepth` | Mapped (history depth) |
| everything else | Ignored; pass a CM6 extension through `editorExtensions` |

## Recipes

### Keymap

```js
// CM5
editor.setOption('extraKeys', { 'Ctrl-B': 'bold' })
// 2.x: string commands for the built-ins, or a CM6 extension for new ones
const editor = new Editor({
  target,
  props: {
    editorConfig: {
      extraKeys: { Enter: 'newlineAndIndentContinueMarkdownList' },
    },
  },
})
```

```js
import { keymap } from '@codemirror/view'

const editor = new Editor({
  target,
  props: {
    editorExtensions: [keymap.of([{ key: 'Mod-b', run: () => true }])],
  },
})
```

### Options removed from CM5

Replace `mode` with the Markdown language already configured by ByteMD. Replace `theme` with the `--bytemd-syntax-*` variables (or a CM6 theme extension). Replace CM5 keymap presets with `keymap.of([...])`.

### CSS

```css
/* CM5: .cm-header, .cm-strong, … */
/* 2.x */
.bytemd {
  --bytemd-syntax-heading: #0550ae;
}
```

### Accessing the native editor

```js
const view = editor.view // CM6 EditorView
view.dispatch({ effects: myCompartment.reconfigure(myExtension) })
```

`editor.view` is the escape hatch for every CM6 feature that the adapter does not expose.

### Large documents

Keep `layoutContainment` disabled when the editor must size itself to its content or when printing expands the layout. For fixed-height editors, enable it for documents around 100 KiB and above:

```js
<Editor value={value} layoutContainment />
```

In a 500 KiB production sample, synchronous typing latency beside the full preview dropped from 169 ms to 14 ms with this enabled. This isolates layout; it does not remove preview rendering cost (the same sample still takes ~3.7 s to render the preview and plugins on load).

When `value` crosses `largeDocumentThreshold` (default `102400`, UTF-16 code units) while `layoutContainment` is off, ByteMD prints a one-time console warning. Disable the check with `largeDocumentThreshold: 0`, or silence the warning with `largeDocumentWarning: false`. The warning is informational only; it never blocks input.

## Verification in this repository

- `packages/bytemd/test/cm6-plugin-contract.test.ts` exercises the adapter the way an out-of-repo plugin would, including the CM5 `Doc` difference.
- All 9 shipped plugins were audited against the upstream README and TS types; none uses `editorEffect`, and only GFM/Mermaid actions touch `ctx.editor`.
- Browser acceptance for the real editor: `audit/cm6-v2-input-verify.mjs` and `audit/cm6-closeout-verify.mjs` (production playground build over CDP).
- Real OS IME and real mobile devices remain manual acceptance items; CDP composition is automation evidence, not a substitute.
