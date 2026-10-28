import type { RenderOptions, RenderResult } from './render-types'
import { rehypeHeadingIds } from './heading-ids'
import { annotateSourceBlocks } from './source-blocks'
import type { ViewerProps } from './types'
import type { Root } from 'hast'
import { defaultSchema } from 'hast-util-sanitize'
import type { Schema } from 'hast-util-sanitize'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import type { Processor } from 'unified'
import { visit } from 'unist-util-visit'

const schemaStr = JSON.stringify(defaultSchema)

/** Pure rendering entry: no UI, CSS, CodeMirror or DOM enhancement imports. */
export function renderMarkdown(options: RenderOptions): RenderResult {
  const { value, plugins = [], sourceMap, version = 0 } = options
  let hast: Root = { type: 'root', children: [] }
  let blocks: RenderResult['blocks'] = []
  const started = performance.now()
  const file = getProcessor({
    ...options,
    plugins: [
      ...plugins,
      {
        rehype: (processor) =>
          processor.use(() => (tree: Root) => {
            hast = tree
            if (sourceMap) blocks = annotateSourceBlocks(tree, version)
          }),
      },
    ],
  }).processSync(value)
  return {
    value,
    file,
    hast,
    blocks,
    mode: 'sync',
    timings: { renderMs: performance.now() - started },
  }
}

// Bound recursive built-in traversals before they receive an adversarial AST.
// Parsing itself and trusted plugins still need host-level time/input budgets.
const remarkTreeBudget = () => (tree: any, file: any) => {
  const pending = [{ node: tree, depth: 0 }]
  let count = 0
  while (pending.length) {
    const { node, depth } = pending.pop()!
    if (++count > 100000 || depth > 128) {
      tree.children = [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: String(file) }],
        },
      ]
      return
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children)
        pending.push({ node: child, depth: depth + 1 })
    }
  }
}

/**
 * Built-in transform: blockquote starting with `[type]` renders as a callout.
 * Supported types (Chinese aliases included):
 *   default/默认, success/成功, warning/警告, info/信息, danger|error/重要
 *
 * >[warning] content
 *
 * becomes
 *
 * <blockquote class="bytemd-callout bytemd-callout-warning">content</blockquote>
 */
const CALLOUT_TYPES: Record<string, string> = {
  default: 'default',
  默认: 'default',
  success: 'success',
  成功: 'success',
  warning: 'warning',
  警告: 'warning',
  info: 'info',
  信息: 'info',
  danger: 'danger',
  error: 'danger',
  重要: 'danger',
}

function remarkCallout() {
  return (tree: any) => {
    visit(tree, 'blockquote', (node: any) => {
      const first = node.children[0]
      if (!first || first.type !== 'paragraph') return
      const text = first.children[0]
      if (!text || text.type !== 'text') return

      const matched = /^\s*\[([^\]\n]+)\][ \t]*/.exec(text.value)
      if (!matched) return

      const type = CALLOUT_TYPES[matched[1].trim()]
      if (!type) return

      const rest = text.value.slice(matched[0].length)
      if (rest === '') {
        first.children.shift()
        if (first.children.length === 0) node.children.shift()
      } else {
        text.value = rest.replace(/^\n/, '')
      }

      node.data = {
        ...node.data,
        hProperties: {
          className: ['bytemd-callout', `bytemd-callout-${type}`],
        },
      }
    })
  }
}

/**
 * Built-in transform for accordions:
 *
 *   +++ collapsed title
 *   content
 *   ++- expanded title
 *   content
 *   ++ collapsed title
 *   content
 *   +++
 *
 * renders as a group of native <details> elements. The opening `+++ title`
 * also creates the first (collapsed) item. Markers may be separated by blank
 * lines, in which case the content blocks between them are moved as-is.
 */
const ACCORDION_START = /^\+\+\+[ \t]+(\S.*?)\s*$/
const ACCORDION_OPEN_ITEM = /^\+\+-[ \t]+(\S.*?)\s*$/
const ACCORDION_ITEM = /^\+\+[ \t]+(\S.*?)\s*$/
const ACCORDION_END = /^\+\+\+[ \t]*$/

const remarkAccordion = () => {
  const makeItem = (title: string, open: boolean, content: any[]): any => ({
    type: 'bytemdAccordionItem',
    data: {
      hName: 'details',
      hProperties: {
        className: ['bytemd-accordion-item'],
        ...(open ? { open: true } : {}),
      },
    },
    children: [
      {
        type: 'bytemdAccordionTitle',
        data: {
          hName: 'summary',
          hProperties: { className: ['bytemd-accordion-title'] },
        },
        children: [{ type: 'text', value: title }],
      },
      {
        type: 'bytemdAccordionBody',
        data: {
          hName: 'div',
          hProperties: { className: ['bytemd-accordion-body'] },
        },
        children: content,
      },
    ],
  })

  const makeGroup = (items: any[], position?: any): any => ({
    type: 'bytemdAccordion',
    data: {
      hName: 'div',
      hProperties: { className: ['bytemd-accordion'] },
    },
    children: items,
    ...(position ? { position } : {}),
  })

  const singleLineText = (node: any): string | null => {
    if (node?.type !== 'paragraph' || node.children?.length !== 1) return null
    const child = node.children[0]
    if (child.type !== 'text' || /[\r\n]/.test(child.value)) return null
    return child.value
  }

  // Split only marker-bearing paragraphs. Keep emphasis/link/code nodes intact
  // rather than reparsing their text or discarding them when markers share a block.
  const splitMarkers = (node: any): any[] => {
    if (node.type !== 'paragraph') return [node]
    const lines: any[][] = [[]]
    for (const child of node.children) {
      if (child.type !== 'text') {
        lines[lines.length - 1].push(child)
        continue
      }
      const parts = child.value.split(/\r?\n/)
      parts.forEach((value: string, index: number) => {
        if (index) lines.push([])
        if (value) lines[lines.length - 1].push({ ...child, value })
      })
    }
    const isMarker = (children: any[]) => {
      if (children.length !== 1 || children[0].type !== 'text') return false
      const text = children[0].value
      return (
        ACCORDION_START.test(text) ||
        ACCORDION_OPEN_ITEM.test(text) ||
        ACCORDION_ITEM.test(text) ||
        ACCORDION_END.test(text)
      )
    }
    if (!lines.some(isMarker)) return [node]
    const result: any[] = []
    let content: any[] = []
    const flush = () => {
      if (content.length) result.push({ ...node, children: content })
      content = []
    }
    lines.forEach((line) => {
      if (isMarker(line)) {
        flush()
        result.push({ ...node, children: line })
      } else {
        if (content.length) content.push({ type: 'text', value: '\n' })
        content.push(...line)
      }
    })
    flush()
    return result
  }

  const parseBlock = (
    children: any[],
    index: number
  ): { node: any; end: number } | null => {
    const startText = singleLineText(children[index])
    const start = startText && ACCORDION_START.exec(startText)
    if (!start) return null

    const items: any[] = []
    let title = start[1]
    let open = false
    let content: any[] = []
    let end = -1

    const pushItem = () => items.push(makeItem(title, open, content))

    for (let i = index + 1; i < children.length; i++) {
      const text = singleLineText(children[i])
      if (text && ACCORDION_END.test(text)) {
        end = i
        break
      }
      if (text) {
        const openItem = ACCORDION_OPEN_ITEM.exec(text)
        if (openItem) {
          pushItem()
          title = openItem[1]
          open = true
          content = []
          continue
        }
        const item = ACCORDION_ITEM.exec(text)
        if (item) {
          pushItem()
          title = item[1]
          open = false
          content = []
          continue
        }
        // An unterminated nested start means this is not a valid group
        if (ACCORDION_START.test(text)) return null
      }
      content.push(children[i])
    }

    if (end === -1) return null
    pushItem()

    const startPos = children[index].position
    const endPos = children[end].position
    return {
      node: makeGroup(
        items,
        startPos && endPos ? { start: startPos.start, end: endPos.end } : null
      ),
      end,
    }
  }

  const transform = (parent: any) => {
    if (!Array.isArray(parent?.children)) return

    const children = parent.children.flatMap(splitMarkers)
    const next: any[] = []
    let matched = false
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const block = parseBlock(children, i)
      if (block) {
        matched = true
        next.push(block.node)
        i = block.end
        continue
      }

      transform(child)
      next.push(child)
    }
    if (matched) parent.children = next
  }

  return (tree: any) => transform(tree)
}

/**
 * Built-in transform for timelines:
 *
 *   ::: timeline 时间线
 *   :: [done] 2024-01-15 项目立项
 *      完成需求评审
 *   :: [doing] 2024-03-20 Alpha 版本
 *      正在联调
 *   :::
 *
 * Supported statuses: done, doing, todo, error, milestone.
 */
const TIMELINE_START = /^:::\s*timeline(?:\s+(.+?))?\s*$/
const TIMELINE_END = /^:::\s*$/
const TIMELINE_ITEM = /^::\s*\[([A-Za-z-]+)\]\s+(\S+)\s+(.+?)\s*$/
const TIMELINE_STATUSES = new Set([
  'done',
  'doing',
  'todo',
  'error',
  'milestone',
])

const remarkTimeline = () => {
  const makeItem = (
    status: string,
    date: string,
    title: string,
    content: any[]
  ): any => ({
    type: 'bytemdTimelineItem',
    data: {
      hName: 'div',
      hProperties: {
        className: ['bytemd-timeline-item', `bytemd-timeline-item-${status}`],
      },
    },
    children: [
      {
        type: 'bytemdTimelineMarker',
        data: {
          hName: 'span',
          hProperties: { className: ['bytemd-timeline-marker'] },
        },
        children: [],
      },
      {
        type: 'bytemdTimelineContent',
        data: {
          hName: 'div',
          hProperties: { className: ['bytemd-timeline-content'] },
        },
        children: [
          {
            type: 'bytemdTimelineDate',
            data: {
              hName: 'span',
              hProperties: { className: ['bytemd-timeline-date'] },
            },
            children: [{ type: 'text', value: date }],
          },
          {
            type: 'bytemdTimelineHeading',
            data: {
              hName: 'div',
              hProperties: { className: ['bytemd-timeline-heading'] },
            },
            children: [{ type: 'text', value: title }],
          },
          ...(content.length
            ? [
                {
                  type: 'bytemdTimelineDesc',
                  data: {
                    hName: 'div',
                    hProperties: { className: ['bytemd-timeline-desc'] },
                  },
                  children: content,
                },
              ]
            : []),
        ],
      },
    ],
  })

  const makeTimeline = (title: string, items: any[], position?: any): any => ({
    type: 'bytemdTimeline',
    data: {
      hName: 'div',
      hProperties: { className: ['bytemd-timeline'] },
    },
    children: [
      ...(title
        ? [
            {
              type: 'bytemdTimelineTitle',
              data: {
                hName: 'div',
                hProperties: { className: ['bytemd-timeline-title'] },
              },
              children: [{ type: 'text', value: title }],
            },
          ]
        : []),
      {
        type: 'bytemdTimelineList',
        data: {
          hName: 'div',
          hProperties: { className: ['bytemd-timeline-list'] },
        },
        children: items,
      },
    ],
    ...(position ? { position } : {}),
  })

  const parseInline = (node: any): any | null => {
    if (node?.type !== 'paragraph' || node.children?.length !== 1) return null
    const child = node.children[0]
    if (child.type !== 'text' || !child.value.includes('\n')) return null

    const lines = child.value.split(/\r?\n/)
    const start = TIMELINE_START.exec(lines[0])
    if (!start) return null

    const items: any[] = []
    let status = ''
    let date = ''
    let title = ''
    let descLines: string[] = []
    let closed = false

    const pushItem = () => {
      if (!status) return
      const desc = descLines.join(' ').trim()
      items.push(
        makeItem(
          status,
          date,
          title,
          desc ? [{ type: 'text', value: desc }] : []
        )
      )
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]

      if (TIMELINE_END.test(line)) {
        closed = lines.slice(i + 1).every((l: string) => !l.trim())
        pushItem()
        break
      }

      const matched = TIMELINE_ITEM.exec(line)
      if (matched) {
        pushItem()
        const rawStatus = matched[1].toLowerCase()
        status = TIMELINE_STATUSES.has(rawStatus) ? rawStatus : 'todo'
        date = matched[2]
        title = matched[3]
        descLines = []
        continue
      }

      // A stray entry marker invalidates the whole block
      if (line.trim().startsWith('::')) return null

      if (!status) {
        if (line.trim()) return null
        continue
      }

      if (line.trim()) descLines.push(line.trim())
    }

    if (!closed || items.length === 0) return null
    return makeTimeline(start[1]?.trim() ?? '', items, node.position)
  }

  const singleLineText = (node: any): string | null => {
    if (node?.type !== 'paragraph' || node.children?.length !== 1) return null
    const child = node.children[0]
    if (child.type !== 'text' || /[\r\n]/.test(child.value)) return null
    return child.value
  }

  // Block form: the fence and each entry live in separate paragraphs, so
  // users can put blank lines (or richer Markdown) between them.
  const parseBlock = (
    children: any[],
    index: number
  ): { node: any; end: number } | null => {
    const startText = singleLineText(children[index])
    const start = startText && TIMELINE_START.exec(startText)
    if (!start) return null

    const items: any[] = []
    let status = ''
    let date = ''
    let title = ''
    let content: any[] = []
    let end = -1

    const pushItem = () => {
      if (!status) return
      items.push(makeItem(status, date, title, content))
    }

    for (let i = index + 1; i < children.length; i++) {
      const text = singleLineText(children[i])
      if (text && TIMELINE_END.test(text)) {
        end = i
        break
      }

      if (text) {
        const matched = TIMELINE_ITEM.exec(text)
        if (matched) {
          pushItem()
          const rawStatus = matched[1].toLowerCase()
          status = TIMELINE_STATUSES.has(rawStatus) ? rawStatus : 'todo'
          date = matched[2]
          title = matched[3]
          content = []
          continue
        }
        if (text.trim().startsWith('::')) return null
      }

      if (!status) return null
      content.push(children[i])
    }

    if (end === -1) return null
    pushItem()
    if (items.length === 0) return null

    const startPos = children[index].position
    const endPos = children[end].position
    return {
      node: makeTimeline(
        start[1]?.trim() ?? '',
        items,
        startPos && endPos ? { start: startPos.start, end: endPos.end } : null
      ),
      end,
    }
  }

  const transform = (parent: any) => {
    if (!Array.isArray(parent?.children)) return

    const next: any[] = []
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i]
      const inline = parseInline(child)
      if (inline) {
        next.push(inline)
        continue
      }

      const block = parseBlock(parent.children, i)
      if (block) {
        next.push(block.node)
        i = block.end
        continue
      }

      transform(child)
      next.push(child)
    }
    parent.children = next
  }

  return (tree: any) => transform(tree)
}

/**
 * Built-in transform for pinyin annotations:
 *
 *   {拼 音|Ping Yin}
 *
 * renders the pinyin above each character. Each syllable is capped at 5
 * characters (zhang) so the annotation can never grow past one character's
 * width; the full text is kept in the `title` attribute.
 */
const PINYIN_PATTERN = /\{\s*([^{}|\n]+?)\s*\|\s*([^{}|\n]+?)\s*\}/g
const PINYIN_MAX_SYLLABLE = 5

const remarkPinyin = () => {
  const clampSyllable = (syllable: string) =>
    Array.from(syllable).slice(0, PINYIN_MAX_SYLLABLE).join('')

  const makePair = (base: string, pinyin: string): any => ({
    type: 'bytemdPinyinItem',
    data: {
      hName: 'span',
      hProperties: { className: ['bytemd-pinyin-item'] },
    },
    children: [
      {
        type: 'bytemdPinyinRt',
        data: {
          hName: 'span',
          hProperties: { className: ['bytemd-pinyin-rt'] },
        },
        children: [{ type: 'text', value: pinyin }],
      },
      { type: 'text', value: base },
    ],
  })

  const makeAnnotation = (base: string, pinyin: string): any => {
    const chars = Array.from(base.replace(/\s+/g, ''))
    let syllables = pinyin
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(clampSyllable)

    let pairs: any[]
    if (chars.length > 0 && syllables.length === chars.length) {
      pairs = chars.map((char, i) => makePair(char, syllables[i]))
    } else {
      // Unbalanced input: never allow more than 5 letters per base character
      if (syllables.length > chars.length) {
        syllables = syllables.slice(0, Math.max(chars.length, 1))
      }
      pairs = [makePair(chars.join('') || base.trim(), syllables.join(' '))]
    }

    return {
      type: 'bytemdPinyin',
      data: {
        hName: 'span',
        hProperties: {
          className: ['bytemd-pinyin'],
          title: pinyin,
        },
      },
      children: pairs,
    }
  }

  const splitText = (value: string): any[] | null => {
    const re = new RegExp(PINYIN_PATTERN.source, 'g')
    const parts: any[] = []
    let last = 0
    let matched = false

    for (let match = re.exec(value); match; match = re.exec(value)) {
      matched = true
      if (match.index > last) {
        parts.push({ type: 'text', value: value.slice(last, match.index) })
      }

      const base = match[1].trim()
      const pinyin = match[2].trim()
      parts.push(
        base && pinyin
          ? makeAnnotation(base, pinyin)
          : { type: 'text', value: match[0] }
      )
      last = re.lastIndex
    }

    if (!matched) return null
    if (last < value.length) {
      parts.push({ type: 'text', value: value.slice(last) })
    }
    return parts
  }

  const transform = (parent: any) => {
    if (!Array.isArray(parent?.children)) return

    const next: any[] = []
    parent.children.forEach((child: any) => {
      if (child.type === 'text') {
        const parts = splitText(child.value)
        if (parts) {
          next.push(...parts)
          return
        }
      } else {
        transform(child)
      }
      next.push(child)
    })
    parent.children = next
  }

  return (tree: any) => transform(tree)
}

/**
 * Built-in transform: paired inline style ranges.
 *   [size=20]text[/size]
 *   [color=#e03131]text[/color]
 *   [bg=#fff3bf]text[/bg]
 * Markers may sit in different inline nodes, so emphasis, links, breaks and
 * inline code inside the range are preserved. Invalid sizes/colors stay text.
 */
const INLINE_STYLE_MIN_SIZE = 8
const INLINE_STYLE_MAX_SIZE = 96
const INLINE_STYLE_MAX_DEPTH = 64
const INLINE_STYLE_MAX_NODES = 10000
const INLINE_STYLE_HEX = /^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const INLINE_STYLE_CLASS = /^bytemd-(size|color|bg)-([0-9a-z]+)$/
const INLINE_STYLE_PARENTS = new Set([
  'paragraph',
  'heading',
  'tableCell',
  'strong',
  'emphasis',
  'delete',
  'link',
  'linkReference',
])

type InlineStyleKind = 'size' | 'color' | 'bg'

const remarkInlineStyle = () => {
  const parseTag = (
    kind: string,
    raw: string
  ): { kind: InlineStyleKind; value: string } | null => {
    if (kind === 'size') {
      const size = Number(raw.trim().replace(/px$/i, ''))
      if (
        !Number.isInteger(size) ||
        size < INLINE_STYLE_MIN_SIZE ||
        size > INLINE_STYLE_MAX_SIZE
      ) {
        return null
      }
      return { kind, value: String(size) }
    }

    if (kind === 'color' || kind === 'bg') {
      const hex = raw.trim().replace(/^#/, '')
      if (!INLINE_STYLE_HEX.test(hex)) return null
      return { kind, value: hex.toLowerCase() }
    }

    return null
  }

  const wrapStyles = (children: any[]) => {
    interface Frame {
      kind: InlineStyleKind
      value: string
      open: string
      children: any[]
    }
    const root: any[] = []
    const stack: Frame[] = []
    let count = 0
    let exceeded = false
    const append = (node: any) => {
      if (++count > INLINE_STYLE_MAX_NODES) exceeded = true
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node)
      } else {
        root.push(node)
      }
    }

    children.forEach((child: any) => {
      if (exceeded) return
      if (
        child.type !== 'text' ||
        !/\[(?:size|color|bg)=|\[\/(?:size|color|bg)\]/i.test(child.value)
      ) {
        append(child)
        return
      }

      const re = /\[(size|color|bg)=([^\]\n]{1,32})\]|\[\/(size|color|bg)\]/gi
      let last = 0
      for (
        let match = re.exec(child.value);
        match && !exceeded;
        match = re.exec(child.value)
      ) {
        if (match.index > last) {
          append({ type: 'text', value: child.value.slice(last, match.index) })
        }

        const token = match[0]
        if (match[3]) {
          const kind = match[3].toLowerCase()
          const top = stack[stack.length - 1]
          if (top && top.kind === kind) {
            stack.pop()
            append({
              type: 'bytemdInlineStyle',
              data: {
                hName: 'span',
                hProperties: {
                  className: [`bytemd-${top.kind}-${top.value}`],
                },
              },
              children: top.children,
            })
          } else {
            append({ type: 'text', value: token })
          }
        } else {
          const parsed = parseTag(match[1].toLowerCase(), match[2])
          if (parsed && stack.length < INLINE_STYLE_MAX_DEPTH) {
            stack.push({ ...parsed, open: token, children: [] })
          } else if (parsed) {
            exceeded = true
          } else {
            append({ type: 'text', value: token })
          }
        }
        last = re.lastIndex
      }
      if (last < child.value.length) {
        append({ type: 'text', value: child.value.slice(last) })
      }
    })

    // Unclosed markers are kept as plain text instead of swallowing content.
    while (stack.length > 0) {
      const frame = stack.pop() as Frame
      append({ type: 'text', value: frame.open })
      frame.children.forEach((child) => append(child))
    }

    // Preserve the original inline AST, including all literal markers, when
    // this paragraph exceeds the budget. Never build a partially paired range.
    return exceeded ? children : root
  }

  const transform = (parent: any) => {
    if (!Array.isArray(parent?.children)) return
    parent.children.forEach((child: any) => {
      if (child.type !== 'text') transform(child)
    })
    if (INLINE_STYLE_PARENTS.has(parent.type)) {
      parent.children = wrapStyles(parent.children)
    }
  }

  return (tree: any) => transform(tree)
}

// Runs after sanitize so generated colors/font sizes survive: the default
// schema intentionally strips arbitrary inline styles.
const rehypeInlineStyle = () => (tree: any) => {
  const applyStyles = (target: any, styles: string[]) => {
    target.properties = target.properties ?? {}
    target.properties.style = [target.properties.style, ...styles]
      .filter(Boolean)
      .join(';')
  }

  const styleLabelImages = (node: any) => {
    if (!Array.isArray(node.children)) return
    node.children.forEach((child: any) => {
      if (child.type === 'element' && child.tagName === 'img') {
        applyStyles(child, [
          'max-height:2em',
          'max-width:8em',
          'width:auto',
          'height:auto',
          'object-fit:contain',
          'vertical-align:middle',
        ])
      }
      styleLabelImages(child)
    })
  }

  visit(tree, 'element', (node: any) => {
    if (!node.properties) return
    const classes = node.properties.className
    const names = Array.isArray(classes) ? classes : [classes]
    const declarations: string[] = []

    for (const name of names) {
      const match = INLINE_STYLE_CLASS.exec(String(name ?? '').toLowerCase())
      if (!match) continue
      const kind = match[1]
      const value = match[2]

      if (kind === 'size') {
        const size = Number(value)
        if (
          Number.isInteger(size) &&
          size >= INLINE_STYLE_MIN_SIZE &&
          size <= INLINE_STYLE_MAX_SIZE
        ) {
          declarations.push(`font-size:${size}px`)
        }
      } else if (INLINE_STYLE_HEX.test(value)) {
        declarations.push(
          `${kind === 'color' ? 'color' : 'background-color'}:#${value}`
        )
      }
    }

    const classNames = new Set(names.map((name) => String(name ?? '')))
    if (classNames.has('bytemd-hr-text')) {
      declarations.push('display:flex', 'align-items:center', 'gap:12px')
    }
    if (classNames.has('bytemd-hr-text-line')) {
      declarations.push(
        'flex:1 1 0',
        'min-width:24px',
        'height:1px',
        'background-color:currentColor',
        'opacity:.25'
      )
    }
    if (classNames.has('bytemd-hr-text-label')) {
      declarations.push(
        'flex:0 1 auto',
        'min-width:0',
        'text-align:center',
        'overflow-wrap:anywhere'
      )
      styleLabelImages(node)
    }

    if (declarations.length > 0) {
      applyStyles(node, declarations)
    }
  })
}

/**
 * Built-in transform: `---text---` on a single line becomes a divider with
 * the label centered between two rules. A plain `---` stays an <hr>, and
 * empty or multi-line ranges are left as normal text.
 */
const remarkDividerText = () => {
  const textOf = (node: any): string => {
    if (node?.type === 'text' || node?.type === 'inlineCode') {
      return node.value ?? ''
    }
    if (Array.isArray(node?.children)) {
      return node.children.map(textOf).join('')
    }
    return ''
  }

  const containsImage = (node: any): boolean => {
    if (node?.type === 'image' || node?.type === 'imageReference') return true
    return Array.isArray(node?.children) && node.children.some(containsImage)
  }

  const makeDivider = (paragraph: any): any | null => {
    const children = paragraph.children
    if (!Array.isArray(children) || children.length === 0) return null
    if (
      children.some(
        (child: any) =>
          child.type === 'break' ||
          (child.type === 'text' && /[\r\n]/.test(child.value))
      )
    ) {
      return null
    }

    const first = children[0]
    const last = children[children.length - 1]
    if (first.type !== 'text' || last.type !== 'text') return null
    if (!first.value.startsWith('---') || !last.value.endsWith('---')) {
      return null
    }

    let content: any[]
    if (first === last) {
      const inner = first.value.slice(3, -3).trim()
      if (!inner || inner.startsWith('-') || inner.endsWith('-')) return null
      content = [{ type: 'text', value: inner }]
    } else {
      const rawHead = first.value.slice(3)
      const rawTail = last.value.slice(0, -3)
      if (rawHead.startsWith('-') || rawTail.endsWith('-')) return null
      const head = rawHead.replace(/^\s+/, '')
      const tail = rawTail.replace(/\s+$/, '')
      content = [
        ...(head ? [{ type: 'text', value: head }] : []),
        ...children.slice(1, -1),
        ...(tail ? [{ type: 'text', value: tail }] : []),
      ]
      if (
        !content.some((child) => textOf(child).trim() || containsImage(child))
      ) {
        return null
      }
    }

    const makeLine = () => ({
      type: 'bytemdDividerLine',
      data: {
        hName: 'span',
        hProperties: { className: ['bytemd-hr-text-line'] },
      },
      children: [],
    })

    return {
      type: 'bytemdDividerText',
      data: {
        hName: 'div',
        hProperties: { className: ['bytemd-hr-text'] },
      },
      children: [
        makeLine(),
        {
          type: 'bytemdDividerLabel',
          data: {
            hName: 'span',
            hProperties: { className: ['bytemd-hr-text-label'] },
          },
          children: content,
        },
        makeLine(),
      ],
      ...(paragraph.position ? { position: paragraph.position } : {}),
    }
  }

  const transform = (parent: any) => {
    if (!Array.isArray(parent?.children)) return
    parent.children = parent.children.map((child: any) => {
      if (child.type === 'paragraph') {
        const divider = makeDivider(child)
        if (divider) return divider
      }
      transform(child)
      return child
    })
  }

  return (tree: any) => transform(tree)
}

/**
 * Get unified processor with ByteMD plugins
 */
export function getProcessor({
  sanitize,
  plugins,
  remarkRehype: remarkRehypeOptions = {},
  headingIds = true,
}: Omit<ViewerProps, 'value'>) {
  let processor: Processor = unified()
    .use(remarkParse)
    .use(remarkTreeBudget as any)
    .use(remarkCallout)
    // unified v10 typings reject a second custom plugin in the chain
    .use(remarkAccordion as any)
    .use(remarkTimeline as any)
    .use(remarkPinyin as any)
    .use(remarkInlineStyle as any)
    .use(remarkDividerText as any)

  plugins?.forEach(({ remark }) => {
    if (remark) processor = remark(processor)
  })
  processor = processor
    .use(remarkRehype, { allowDangerousHtml: true, ...remarkRehypeOptions })
    .use(rehypeRaw)

  let schema = JSON.parse(schemaStr) as Schema
  schema.attributes!['*'].push('className') // Allow class names by default

  if (typeof sanitize === 'function') {
    schema = sanitize(schema)
  }

  processor = processor
    .use(rehypeSanitize, schema)
    .use(rehypeInlineStyle as any)

  if (headingIds !== false) {
    processor = processor.use(
      rehypeHeadingIds as any,
      typeof headingIds === 'object' ? headingIds : {}
    )
  }

  plugins?.forEach(({ rehype }) => {
    if (rehype) processor = rehype(processor)
  })

  return processor.use(rehypeStringify)
}
