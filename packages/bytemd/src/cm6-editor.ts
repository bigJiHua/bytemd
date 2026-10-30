import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from '@codemirror/commands'
import {
  insertNewlineContinueMarkup,
  markdown,
  markdownLanguage,
} from '@codemirror/lang-markdown'
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { Compartment, EditorState, RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'

const bytemdHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '600', fontSize: '1.3em' },
  { tag: tags.heading2, fontWeight: '600', fontSize: '1.2em' },
  { tag: tags.heading3, fontWeight: '600', fontSize: '1.1em' },
  {
    tag: [tags.heading4, tags.heading5, tags.heading6, tags.heading],
    fontWeight: '600',
    color: 'var(--bytemd-syntax-heading)',
  },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  // CM5 colored the markdown marks and rules as `cm-meta`/`cm-hr`.
  {
    tag: [tags.processingInstruction, tags.contentSeparator],
    color: 'var(--bytemd-syntax-comment)',
  },
  { tag: tags.keyword, color: 'var(--bytemd-syntax-keyword)' },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: 'var(--bytemd-syntax-string)',
  },
  {
    tag: [tags.comment, tags.quote],
    color: 'var(--bytemd-syntax-comment)',
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: 'var(--bytemd-syntax-number)',
  },
  {
    tag: [tags.variableName, tags.propertyName],
    color: 'var(--bytemd-syntax-variable)',
  },
  { tag: tags.tagName, color: 'var(--bytemd-syntax-tag)' },
  { tag: tags.attributeName, color: 'var(--bytemd-syntax-attribute)' },
  { tag: [tags.link, tags.url], color: 'var(--bytemd-syntax-link)' },
  { tag: tags.monospace, fontFamily: 'monospace' },
])

const yamlKey = Decoration.mark({ class: 'bytemd-yaml-key' })
const yamlPunct = Decoration.mark({ class: 'bytemd-yaml-punct' })
const yamlString = Decoration.mark({ class: 'bytemd-yaml-string' })
const yamlNumber = Decoration.mark({ class: 'bytemd-yaml-number' })
const yamlKeyword = Decoration.mark({ class: 'bytemd-yaml-keyword' })
const yamlComment = Decoration.mark({ class: 'bytemd-yaml-comment' })

interface YamlSpan {
  from: number
  to: number
  deco: Decoration
}

// Inline tokens inside one frontmatter value; the single regex keeps spans
// sequential, so they never overlap.
const yamlValuePattern =
  /"[^"\n]*"|'[^'\n]*'|-?\d[\d.]*|\b(?:true|false|null|yes|no|on|off)\b/gi

/**
 * Highlights the YAML front matter block (leading `---` fences) the way the
 * CM5 `yaml-frontmatter` mode did. The preview (remark-frontmatter) only
 * treats a leading `---` line as front matter, so this matches that contract:
 * without a closing fence the rest of the document stays highlighted.
 */
function buildFrontmatterDecorations(state: EditorState): DecorationSet {
  const doc = state.doc
  const first = doc.line(1)
  if (first.text.trim() !== '---') return Decoration.none

  let closing: { from: number; to: number } | undefined
  for (let n = 2; n <= doc.lines; n++) {
    const line = doc.line(n)
    if (/^(\.\.\.|---)\s*$/.test(line.text)) {
      closing = { from: line.from, to: line.to }
      break
    }
  }
  const contentEnd = closing ? closing.from : doc.length

  const spans: YamlSpan[] = []
  const push = (from: number, to: number, deco: Decoration) => {
    if (to > from) spans.push({ from, to, deco })
  }

  const highlightLine = (line: { from: number; text: string }) => {
    const text = line.text
    const keyMatch = /^(\s*(?:-\s+)?)([^:#]+?)(?=\s*:)/.exec(text)
    let valueFrom: number
    if (keyMatch) {
      const keyStart = line.from + keyMatch[1].length
      push(keyStart, keyStart + keyMatch[2].length, yamlKey)
      const colon = line.from + keyMatch[0].length
      push(colon, colon + 1, yamlPunct)
      valueFrom = keyMatch[0].length + 1
    } else {
      valueFrom = 0
    }
    // A list dash before any key is punctuation in the CM5 yaml mode.
    const dash = /^\s*(-)\s+/.exec(text)
    if (dash && !keyMatch) {
      push(
        line.from + dash[1].length - 1,
        line.from + dash[1].length,
        yamlPunct,
      )
    }
    const value = text.slice(valueFrom)
    yamlValuePattern.lastIndex = 0
    for (
      let m = yamlValuePattern.exec(value);
      m;
      m = yamlValuePattern.exec(value)
    ) {
      const from = line.from + valueFrom + m.index
      const token = m[0]
      if (/^["']/.test(token)) push(from, from + token.length, yamlString)
      else if (/^-?\d/.test(token)) push(from, from + token.length, yamlNumber)
      else if (/^(true|false|null|yes|no|on|off)$/i.test(token))
        push(from, from + token.length, yamlKeyword)
    }
    // A `#` comment starts at the line start or after whitespace and runs to
    // the end of the line.
    const comment = /(^|\s)#.*$/.exec(value)
    if (comment) {
      const hash = valueFrom + comment.index + comment[1].length
      push(line.from + hash, line.from + valueFrom + value.length, yamlComment)
    }
  }

  push(first.from, first.to, yamlPunct)
  if (closing) push(closing.from, closing.to, yamlPunct)
  for (let n = 2; n <= doc.lines; n++) {
    const line = doc.line(n)
    if (line.from >= contentEnd) break
    highlightLine(line)
  }

  if (!spans.length) return Decoration.none
  spans.sort((a, b) => a.from - b.from || a.to - b.to)
  const builder = new RangeSetBuilder<Decoration>()
  for (const span of spans) builder.add(span.from, span.to, span.deco)
  return builder.finish()
}

const frontmatterHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildFrontmatterDecorations(view.state)
    }
    update(update: ViewUpdate) {
      if (update.docChanged)
        this.decorations = buildFrontmatterDecorations(update.state)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

export interface CM6Pos {
  line: number
  ch: number
}

export interface CM6Range {
  anchor: CM6Pos
  head: CM6Pos
  from(): CM6Pos
  to(): CM6Pos
}

type Listener = (...args: any[]) => void

/**
 * CM5-shaped adapter over CodeMirror 6. It keeps the existing editor host and
 * plugin-facing API working while CM6 owns the document, selection, history
 * and viewport measurements.
 */
export class CM6CompatEditor {
  view: EditorView
  /** Present for CM5 plugins that only probe these private callbacks. */
  state = { selectingText: undefined, draggingText: undefined }
  display = { blinker: undefined }

  private options: Record<string, any>
  private listeners = new Map<string, Set<Listener>>()
  private keyMaps: Record<string, string | ((...args: any[]) => void)>[] = []
  private cleanups: (() => void)[] = []
  private readOnlyConf = new Compartment()

  constructor(target: HTMLElement, options: Record<string, any> = {}) {
    this.options = options
    const extensions: Extension[] = [
      highlightSpecialChars(),
      history(
        typeof options.undoDepth === 'number' && options.undoDepth > 0
          ? { minDepth: options.undoDepth }
          : undefined,
      ),
      drawSelection(),
      markdown({ base: markdownLanguage }),
      frontmatterHighlighter,
      syntaxHighlighting(bytemdHighlightStyle),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorState.tabSize.of(options.tabSize ?? 8),
      indentUnit.of(' '.repeat(options.indentUnit ?? 4)),
      // Keep `.CodeMirror` selectors and test helpers working during
      // migration. CM6 rewrites the root/content class names on every update,
      // so the compat classes must come from the attribute facets — an
      // imperative classList.add is wiped at the first focus/selection update.
      EditorView.editorAttributes.of({ class: 'CodeMirror' }),
      EditorView.contentAttributes.of({ class: 'CodeMirror-lines' }),
      this.readOnlyConf.of(
        options.readOnly ? EditorState.readOnly.of(true) : [],
      ),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) this.emit('change')
      }),
    ]
    if (options.lineNumbers !== false) extensions.push(lineNumbers())
    if (options.lineWrapping !== false) extensions.push(EditorView.lineWrapping)
    if (options.editorExtensions) {
      extensions.push(...(options.editorExtensions as Extension[]))
    }
    if (options.placeholder) extensions.push(placeholder(options.placeholder))
    this.view = new EditorView({
      state: EditorState.create({ doc: options.value ?? '', extensions }),
      parent: target,
    })
    ;(this.view.dom as unknown as { CodeMirror: CM6CompatEditor }).CodeMirror =
      this
    // CM5 resolves extraKeys before every registered keymap.
    if (options.extraKeys) this.keyMaps.push(options.extraKeys)
    if (options.autofocus) this.view.focus()
    this.bindDom()
  }

  private bindDom() {
    const on = (el: EventTarget, type: string, fn: EventListener) => {
      const capture = type === 'keydown'
      el.addEventListener(type, fn, capture)
      this.cleanups.push(() => el.removeEventListener(type, fn, capture))
    }
    on(this.view.scrollDOM, 'scroll', () => this.emit('scroll'))
    on(this.view.contentDOM, 'drop', (event) => this.emit('drop', this, event))
    on(this.view.contentDOM, 'paste', (event) =>
      this.emit('paste', this, event),
    )
    on(this.view.contentDOM, 'focus', () => this.emit('focus'))
    on(this.view.contentDOM, 'blur', () => this.emit('blur'))
    on(this.view.contentDOM, 'keydown', (event) =>
      this.handleKeydown(event as KeyboardEvent),
    )
  }

  private emit(type: string, ...args: any[]) {
    this.listeners.get(type)?.forEach((listener) => listener(...args))
  }

  on(type: string, listener: Listener) {
    let set = this.listeners.get(type)
    if (!set) this.listeners.set(type, (set = new Set()))
    set.add(listener)
  }

  off(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }

  private handleKeydown(event: KeyboardEvent) {
    for (const map of this.keyMaps) {
      for (const [combo, action] of Object.entries(map)) {
        if (!this.matches(combo, event)) continue
        if (typeof action === 'string') {
          // CM5 commands decline with Pass (e.g. list continuation on plain
          // text); a declined command must fall through to CM6's own keymap,
          // so only consume the event when the command reports handling it.
          if (!this.runCommand(action)) continue
        } else {
          action()
        }
        // CM6's own keymap listens on the same element; it also honors
        // defaultPrevented, but stop immediately so nothing else re-runs it.
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
    }
  }

  private matches(combo: string, event: KeyboardEvent) {
    const parts = combo.split('-')
    const key = parts.pop()?.toLowerCase()
    if (!key) return false
    const mod =
      parts.includes('Cmd') || parts.includes('Ctrl') || parts.includes('Mod')
    if (mod !== (event.metaKey || event.ctrlKey)) return false
    if (parts.includes('Shift') !== event.shiftKey) return false
    if (parts.includes('Alt') !== event.altKey) return false
    return event.key.toLowerCase() === key
  }

  private runCommand(name: string): boolean {
    switch (name) {
      case 'indentMore':
        indentMore(this.view)
        return true
      case 'indentLess':
        indentLess(this.view)
        return true
      case 'newlineAndIndentContinueMarkdownList':
      case 'newlineAndIndent':
        return insertNewlineContinueMarkup(this.view)
      default:
        return false
    }
  }

  addKeyMap(map: Record<string, string | ((...args: any[]) => void)>) {
    this.keyMaps.push(map)
  }

  removeKeyMap(map: Record<string, any>) {
    this.keyMaps = this.keyMaps.filter((item) => item !== map)
  }

  getDoc() {
    return this.view.state.doc
  }

  getOption(name: string) {
    if (name === 'value') return this.getValue()
    if (name === 'lineNumbers') return this.options.lineNumbers !== false
    if (name === 'lineWrapping') return this.options.lineWrapping !== false
    return this.options[name]
  }

  getValue() {
    return this.view.state.doc.toString()
  }

  setValue(value: string) {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: value },
      selection: { anchor: 0 },
    })
  }

  getCursor(where: 'from' | 'to' | 'head' | 'anchor' = 'head'): CM6Pos {
    const range = this.view.state.selection.main
    const index =
      where === 'from'
        ? Math.min(range.from, range.to)
        : where === 'to'
          ? Math.max(range.from, range.to)
          : where === 'anchor'
            ? range.anchor
            : range.head
    return this.posFromIndex(index)
  }

  setCursor(pos: CM6Pos) {
    this.setSelection(pos, pos)
  }

  getSelection() {
    const { from, to } = this.view.state.selection.main
    return this.view.state.sliceDoc(from, to)
  }

  replaceSelection(text: string) {
    const { from, to } = this.view.state.selection.main
    this.view.dispatch({ changes: { from, to, insert: text } })
  }

  somethingSelected() {
    const { from, to } = this.view.state.selection.main
    return from !== to
  }

  listSelections(): CM6Range[] {
    return this.view.state.selection.ranges.map((range) => ({
      anchor: this.posFromIndex(range.anchor),
      head: this.posFromIndex(range.head),
      from: () => this.posFromIndex(Math.min(range.from, range.to)),
      to: () => this.posFromIndex(Math.max(range.from, range.to)),
    }))
  }

  findWordAt(pos: CM6Pos): CM6Range {
    const index = this.toIndex(pos)
    const word = this.view.state.wordAt(index)
    const from = word?.from ?? index
    const to = word?.to ?? index
    return {
      anchor: this.posFromIndex(from),
      head: this.posFromIndex(to),
      from: () => this.posFromIndex(from),
      to: () => this.posFromIndex(to),
    }
  }

  getRange(from: CM6Pos, to?: CM6Pos) {
    return this.view.state.sliceDoc(
      this.toIndex(from),
      to ? this.toIndex(to) : this.toIndex(from),
    )
  }

  replaceRange(text: string, from: CM6Pos, to?: CM6Pos) {
    const start = this.toIndex(from)
    this.view.dispatch({
      changes: { from: start, to: to ? this.toIndex(to) : start, insert: text },
    })
  }

  setSelection(anchor: CM6Pos, head: CM6Pos = anchor) {
    this.view.dispatch({
      selection: { anchor: this.toIndex(anchor), head: this.toIndex(head) },
    })
  }

  getLine(line: number) {
    return this.view.state.doc.line(line + 1).text
  }

  lineCount() {
    return this.view.state.doc.lines
  }

  indexFromPos(pos: CM6Pos): number {
    const lineNumber = Math.min(
      Math.max(1, pos.line + 1),
      this.view.state.doc.lines,
    )
    const line = this.view.state.doc.line(lineNumber)
    return line.from + Math.max(0, Math.min(pos.ch, line.length))
  }

  posFromIndex(index: number): CM6Pos {
    const safe = Math.max(0, Math.min(index, this.view.state.doc.length))
    const line = this.view.state.doc.lineAt(safe)
    return { line: line.number - 1, ch: safe - line.from }
  }

  private toIndex(pos: CM6Pos | number): number {
    if (typeof pos === 'number')
      return Math.max(0, Math.min(pos, this.view.state.doc.length))
    return this.indexFromPos(pos)
  }

  getScrollInfo() {
    const el = this.view.scrollDOM
    return {
      left: el.scrollLeft,
      top: el.scrollTop,
      width: el.scrollWidth,
      height: el.scrollHeight,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
    }
  }

  heightAtLine(line: number) {
    const safe = Math.min(Math.max(1, line + 1), this.view.state.doc.lines)
    return this.view.lineBlockAt(this.view.state.doc.line(safe).from).top
  }

  scrollTo(left: number | null, top: number | null) {
    this.view.scrollDOM.scrollLeft = left ?? 0
    this.view.scrollDOM.scrollTop = top ?? 0
  }

  getScrollerElement() {
    return this.view.scrollDOM
  }

  getInputField() {
    return this.view.contentDOM
  }

  getWrapperElement() {
    return this.view.dom
  }

  focus() {
    this.view.focus()
  }

  refresh() {
    this.view.requestMeasure()
  }

  setSize() {}

  setOption(name: string, value: any) {
    this.options[name] = value
    // CM6 input handling consults EditorState.readOnly; selection/copy and
    // programmatic dispatch stay available, like CM5 readOnly.
    if (name === 'readOnly') {
      this.view.dispatch({
        effects: this.readOnlyConf.reconfigure(
          value ? EditorState.readOnly.of(true) : [],
        ),
      })
    }
  }

  destroy() {
    this.cleanups.forEach((cleanup) => cleanup())
    this.cleanups = []
    this.listeners.clear()
    this.view.destroy()
  }
}

export type CM6Factory = ((
  target: HTMLElement,
  options?: Record<string, any>,
) => CM6CompatEditor) & {
  Pos: (line: number, ch?: number) => CM6Pos
  signal: (target: any, name: string, ...args: any[]) => void
}

export function createCM6Factory(): CM6Factory {
  const factory = ((target: HTMLElement, options?: Record<string, any>) =>
    new CM6CompatEditor(target, options)) as CM6Factory
  factory.Pos = (line: number, ch = 0) => ({ line, ch })
  factory.signal = (target: any, name: string, ...args: any[]) => {
    target?.emit?.(name, ...args)
  }
  return factory
}
