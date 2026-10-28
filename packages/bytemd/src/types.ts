import type { EditorUtils } from './editor'
import type { BytemdRenderer } from './render-types'
import type { Editor, EditorConfiguration } from 'codemirror'
import type CodeMirror from 'codemirror'
import type { Schema } from 'hast-util-sanitize'
import type { Image } from 'mdast'
import type { Options } from 'remark-rehype'
import type { Processor } from 'unified'
import type { VFile } from 'vfile'

export interface BytemdLocale {
  copy?: string
  copySuccess?: string
  copyFailed?: string
  renderError?: string
  renderPending?: string
  pluginError?: string
  /** Accessible name of the toolbar; falls back to English. */
  toolbar?: string
  accordion: string
  calloutDefault: string
  calloutSuccess: string
  calloutWarning: string
  calloutInfo: string
  calloutDanger: string
  pinyin: string
  timeline: string
  fontSize: string
  fontColor: string
  bgColor: string
  textSample: string
  hrText: string
  hrTextSample: string
  resize: string
  write: string
  preview: string
  writeOnly: string
  exitWriteOnly: string
  previewOnly: string
  exitPreviewOnly: string
  help: string
  closeHelp: string
  toc: string
  closeToc: string
  fullscreen: string
  exitFullscreen: string
  source: string
  cheatsheet: string
  shortcuts: string
  words: string
  lines: string
  sync: string
  top: string
  limited: string
  h1: string
  h2: string
  h3: string
  h4: string
  h5: string
  h6: string
  headingText: string
  bold: string
  boldText: string
  italic: string
  italicText: string
  quote: string
  quotedText: string
  link: string
  linkText: string
  image: string
  imageAlt: string
  imageTitle: string
  code: string
  codeText: string
  codeBlock: string
  codeLang: string
  ul: string
  ulItem: string
  ol: string
  olItem: string
  hr: string
}

export interface BytemdEditorContext extends EditorUtils {
  codemirror: typeof CodeMirror
  /**
   * CodeMirror editor instance
   */
  editor: Editor
  /**
   * The root element
   */
  root: HTMLElement
  /** Whether the owning editor has been destroyed; async actions must stop. */
  isDestroyed?(): boolean
}

export interface BytemdViewerContext {
  /**
   * The root element of the viewer
   * Editor preview blocks carry data-bytemd-block metadata for scroll mapping.
   * Preserve it on replacements; wrapping/removing blocks is supported.
   */
  markdownBody: HTMLElement
  /**
   * Virtual file format used in [unified](https://unifiedjs.com/)
   *
   * Get the HTML output by calling `vfile.toString()`
   */
  file: VFile
  /** Report a failed DOM enhancement; reports after cleanup are ignored. */
  reportError?(
    error: unknown,
    details?: { plugin?: string; element?: HTMLElement },
  ): void
}

/** Detail of the bubbling bytemd-plugin-error DOM event. */
export interface BytemdPluginError {
  error: unknown
  plugin?: string
  element?: HTMLElement
  file: VFile
}

type Listener = (context: BytemdEditorContext) => void

type BytemdActionHandler =
  | {
      type: 'action'
      click: Listener
      /**
       * Keyboard shortcut
       *
       * If specified, this shortcut will bind to click listener
       * and will be added to the Keyboard shortcut section
       *
       * https://codemirror.net/doc/manual.html#keymaps
       */
      shortcut?: string
      /**
       * mouseenter event listener, only takes effect in dropdown items
       */
      mouseenter?: Listener
      /**
       * mouseleave event listener, only takes effect in dropdown items
       */
      mouseleave?: Listener
    }
  | {
      type: 'dropdown'
      actions: BytemdAction[]
    }

export interface BytemdAction {
  /**
   * Action title
   */
  title?: string
  /**
   * Action icon position
   *
   * Specifies that the action icon is in the toolbar position, which defaults to the left
   */
  position?: 'left' | 'right'
  /**
   * Action icon (16x16), usually inline svg
   */
  icon?: string
  /**
   * Toolbar visual group
   *
   * Consecutive actions with the same group are rendered together, and
   * groups are separated by a divider. Purely presentational: it does not
   * affect the cheatsheet or the action order.
   */
  group?: string
  /**
   * Markdown syntax cheatsheet
   *
   * If specified, this record will be added to the Markdown cheatsheet section
   */
  cheatsheet?: string
  /**
   * Action handler
   */
  handler?: BytemdActionHandler
}

export interface BytemdPlugin {
  /**
   * Customize Markdown parse by remark plugins:
   *
   * https://github.com/remarkjs/remark/blob/main/doc/plugins.md
   */
  remark?: (
    p: Processor<any, any, any, any, any>,
  ) => Processor<any, any, any, any, any>
  /**
   * Customize HTML parse by rehype plugins:
   *
   * https://github.com/rehypejs/rehype/blob/main/doc/plugins.md
   */
  rehype?: (
    p: Processor<any, any, any, any, any>,
  ) => Processor<any, any, any, any, any>
  /**
   * Register actions in toolbar, cheatsheet and shortcuts
   */
  actions?: BytemdAction[]
  /**
   * Side effect for the editor, triggers when plugin changes
   */
  editorEffect?(ctx: BytemdEditorContext): void | (() => void)
  /**
   * Side effect for the viewer, triggers when viewer props changes
   */
  viewerEffect?(ctx: BytemdViewerContext): void | (() => void)
}

export interface EditorProps extends ViewerProps {
  /**
   * Editor display mode
   *
   * - `split`: edit on the left and preview on the right
   * - `tab`: click tabs to switch between edit and preview
   * - `auto`: auto determined by the width of editor container
   *
   * @defaultValue `auto`
   */
  mode?: 'split' | 'tab' | 'auto'
  /**
   * Debounce time (ms) for preview
   *
   * @defaultValue 300
   */
  previewDebounce?: number
  /**
   * Isolate the body's intrinsic size in a fixed-height editor viewport.
   * Reduces layout work during typing next to large previews. Leave disabled
   * when the editor must expand with its content, including print layouts.
   * Does not virtualize content or change preview completion work.
   * @defaultValue false
   */
  layoutContainment?: boolean
  /**
   * Editor placeholder
   */
  placeholder?: string
  /**
   * CodeMirror editor config
   *
   * https://codemirror.net/doc/manual.html#config
   */
  editorConfig?: Omit<EditorConfiguration, 'value' | 'placeholder'>
  /**
   * i18n locale
   *
   * @defaultValue en
   */
  locale?: Partial<BytemdLocale>
  /**
   * Handle images upload
   */
  uploadImages?: (
    files: File[],
  ) => Promise<Pick<Image, 'url' | 'alt' | 'title'>[]>
  /**
   * Override the default preview area render
   *
   * If specified, the built-in viewer would not take effect.
   */
  overridePreview?(el: HTMLElement, props: ViewerProps): void
  /**
   * Warning threshold for value.length (UTF-16 code units).
   * Shows an over-limit indicator without blocking input or truncating value.
   *
   * @defaultValue Infinity
   */
  maxLength?: number
}

export interface ViewerProps {
  /** Optional asynchronous rendering. Omit to preserve synchronous rendering/SSR. */
  renderer?: BytemdRenderer
  /** Viewer feedback strings; unspecified strings use the existing defaults. */
  locale?: Partial<BytemdLocale>
  /**
   * Markdown text
   */
  value: string
  /**
   * ByteMD plugin list
   */
  plugins?: BytemdPlugin[]
  /**
   * Sanitize strategy: Defaults to GitHub style sanitation with class names allowed
   *
   * https://github.com/syntax-tree/hast-util-sanitize/blob/main/lib/github.json
   *
   * If you want further customization, pass a function to mutate sanitize schema.
   */
  sanitize?: (schema: Schema) => Schema
  /**
   * custom remark-rehype options: Defaults value { allowDangerousHtml: true }
   *
   * https://github.com/remarkjs/remark-rehype
   */
  remarkRehype?: Options
  /**
   * Add GitHub-style `id` attributes to Markdown headings so in-page bracketed
   * links (`[Jump](#标题)`) resolve. Defaults to enabled; pass `false` to keep
   * the historical HTML output, or set a prefix such as `user-content-`.
   */
  headingIds?: boolean | { prefix?: string }
}
