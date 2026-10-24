import type { ViewerProps } from './types'
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

  const contentParagraph = (lines: string[]): any[] => {
    const value = lines.join('\n').replace(/^\n+|\n+$/g, '')
    if (!value.trim()) return []
    return [{ type: 'paragraph', children: [{ type: 'text', value }] }]
  }

  const singleLineText = (node: any): string | null => {
    if (node?.type !== 'paragraph' || node.children?.length !== 1) return null
    const child = node.children[0]
    if (child.type !== 'text' || /[\r\n]/.test(child.value)) return null
    return child.value
  }

  const parseInline = (node: any): any | null => {
    if (node?.type !== 'paragraph' || node.children?.length !== 1) return null
    const child = node.children[0]
    if (child.type !== 'text' || !child.value.includes('\n')) return null

    const lines = child.value.split(/\r?\n/)
    const start = ACCORDION_START.exec(lines[0])
    if (!start) return null

    const items: any[] = []
    let title = start[1]
    let open = false
    let contentLines: string[] = []
    let closed = false

    const pushItem = () =>
      items.push(makeItem(title, open, contentParagraph(contentLines)))

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (ACCORDION_END.test(line)) {
        closed = lines.slice(i + 1).every((l: string) => !l.trim())
        pushItem()
        break
      }
      const openItem = ACCORDION_OPEN_ITEM.exec(line)
      if (openItem) {
        pushItem()
        title = openItem[1]
        open = true
        contentLines = []
        continue
      }
      const item = ACCORDION_ITEM.exec(line)
      if (item) {
        pushItem()
        title = item[1]
        open = false
        contentLines = []
        continue
      }
      contentLines.push(line)
    }

    return closed ? makeGroup(items, node.position) : null
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
    desc: string
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
          ...(desc
            ? [
                {
                  type: 'bytemdTimelineDesc',
                  data: {
                    hName: 'div',
                    hProperties: { className: ['bytemd-timeline-desc'] },
                  },
                  children: [{ type: 'text', value: desc }],
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
      items.push(makeItem(status, date, title, desc))
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

  const transform = (parent: any) => {
    if (!Array.isArray(parent?.children)) return

    const next: any[] = []
    parent.children.forEach((child: any) => {
      const timeline = parseInline(child)
      if (timeline) {
        next.push(timeline)
        return
      }
      transform(child)
      next.push(child)
    })
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
 * Inject a copy button into every `pre` under `root`.
 * Idempotent: existing `.bytemd-copy-btn` are kept.
 */
export function addCopyButtons(root: HTMLElement) {
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.bytemd-copy-btn')) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'bytemd-copy-btn'
    btn.textContent = '复制'
    pre.appendChild(btn)
  })
}

/**
 * Copy the code content of the `pre` that contains `btn`,
 * then flash the button text to `已复制`.
 */
export function copyCodeFromButton(btn: HTMLButtonElement) {
  const pre = btn.closest('pre')
  if (!pre) return
  const text = pre.querySelector('code')?.textContent ?? ''
  const done = () => {
    btn.textContent = '已复制'
    setTimeout(() => {
      btn.textContent = '复制'
    }, 1200)
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done)
  } else {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    done()
  }
}

/**
 * Get unified processor with ByteMD plugins
 */
export function getProcessor({
  sanitize,
  plugins,
  remarkRehype: remarkRehypeOptions = {},
}: Omit<ViewerProps, 'value'>) {
  let processor: Processor = unified()
    .use(remarkParse)
    .use(remarkCallout)
    // unified v10 typings reject a second custom plugin in the chain
    .use(remarkAccordion as any)
    .use(remarkTimeline as any)
    .use(remarkPinyin as any)

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

  processor = processor.use(rehypeSanitize, schema)

  plugins?.forEach(({ rehype }) => {
    if (rehype) processor = rehype(processor)
  })

  return processor.use(rehypeStringify)
}
