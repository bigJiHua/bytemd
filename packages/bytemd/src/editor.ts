import type { CM6CompatEditor, CM6Factory, CM6Pos } from './cm6-editor'
import { createCM6Factory } from './cm6-editor'
import { icons } from './icons'
import type {
  BytemdPlugin,
  BytemdAction,
  EditorProps,
  BytemdLocale,
  BytemdEditorContext,
} from './types'
import selectFiles from 'select-files'

const codeMirrorFactory = createCM6Factory()

export function createCodeMirror() {
  return codeMirrorFactory
}

/** CM6 owns the view lifecycle; destroy releases DOM and listeners. */
export function cancelEditorInteractions(editor: CM6CompatEditor) {
  editor.destroy()
}

export type EditorUtils = ReturnType<typeof createEditorUtils>

export function createEditorUtils(
  codemirror: CM6Factory,
  editor: CM6CompatEditor,
) {
  // The component spreads these helpers before the editor mounts, so every
  // method resolves the view lazily. Each helper applies one dispatch so
  // wrap/replace/append undo in a single step with the selection restored,
  // matching the CM5 net effect.
  return {
    /**
     * Wrap text with decorators, for example:
     *
     * `text -> *text*`
     */
    wrapText(before: string, after = before) {
      const view = editor.view
      const { state } = view
      const main = state.selection.main
      let from: number
      let to: number
      let reversed: boolean
      if (!main.empty) {
        from = main.from // use from/to instead of anchor/head for reverse select
        to = main.to
        reversed = main.anchor > main.head
      } else {
        // CM5 findWordAt collapses to the cursor when no word is under it.
        const word = state.wordAt(main.head)
        from = word?.from ?? main.head
        to = word?.to ?? main.head
        reversed = false
      }
      const text = state.sliceDoc(from, to)
      const fromBefore = Math.max(0, from - before.length)
      const toAfter = to + after.length
      let selectionStart: number
      let changes: { from: number; to?: number; insert?: string }[]
      if (
        from >= before.length &&
        state.sliceDoc(fromBefore, from) === before &&
        state.sliceDoc(to, toAfter) === after
      ) {
        // already wrapped: remove the surrounding decorators
        changes = [
          { from: fromBefore, to: from },
          { from: to, to: toAfter },
        ]
        selectionStart = from - before.length
      } else {
        changes = [{ from, to, insert: before + text + after }]
        selectionStart = from + before.length
      }
      view.dispatch({
        changes,
        selection: {
          anchor: reversed ? selectionStart + text.length : selectionStart,
          head: reversed ? selectionStart : selectionStart + text.length,
        },
      })
    },
    /**
     * replace multiple lines
     *
     * `line -> # line`
     */
    replaceLines(replace: Parameters<Array<string>['map']>[0]) {
      const view = editor.view
      const { state } = view
      const main = state.selection.main
      const from = state.doc.lineAt(main.from).from
      // Anchoring the end at the start of the last line keeps the trailing
      // partial line (it only gets the prefix prepended), like CM5's
      // `Pos(selection.to().line)` anchor.
      const to = state.doc.lineAt(main.to).from
      const lines = state.sliceDoc(from, to).split('\n')
      const insert = lines.map(replace).join('\n')
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from, head: to + (insert.length - (to - from)) },
      })
    },
    /**
     * Append a block based on the cursor position
     */
    appendBlock(content: string): CM6Pos {
      const view = editor.view
      const { state } = view
      const doc = state.doc
      const cursorLine = doc.lineAt(state.selection.main.head).number - 1
      // find the first blank line

      let emptyLine = -1
      for (let i = cursorLine; i < doc.lines; i++) {
        if (!doc.line(i + 1).text.trim()) {
          emptyLine = i
          break
        }
      }
      if (emptyLine === -1) {
        // CM5 appended a separator line plus the content at the document end.
        const contentLine = doc.lines + 1
        view.dispatch({
          changes: { from: doc.length, insert: `\n\n${content}` },
        })
        return codemirror.Pos(contentLine, 0)
      }
      const line = doc.line(emptyLine + 1)
      view.dispatch({ changes: { from: line.from, insert: `\n${content}` } })
      return codemirror.Pos(emptyLine + 1, 0)
    },
    /**
     * Triggers a virtual file input and let user select files
     *
     * https://www.npmjs.com/package/select-files
     */
    selectFiles,
  }
}

export function findStartIndex(num: number, nums: number[]) {
  let startIndex = nums.length - 2
  for (let i = 0; i < nums.length; i++) {
    if (num < nums[i]) {
      startIndex = i - 1
      break
    }
  }
  startIndex = Math.max(startIndex, 0) // ensure >= 0
  return startIndex
}

const getShortcutWithPrefix = (key: string, shift = false) => {
  const shiftPrefix = shift ? 'Shift-' : ''
  const CmdPrefix =
    typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
      ? 'Cmd-'
      : 'Ctrl-'
  return shiftPrefix + CmdPrefix + key
}

export async function handleImageUpload(
  { editor, appendBlock, codemirror, isDestroyed }: BytemdEditorContext,
  uploadImages: NonNullable<EditorProps['uploadImages']>,
  files: File[],
) {
  if (!files.length || isDestroyed?.()) return
  let imgs: Awaited<ReturnType<typeof uploadImages>>
  try {
    imgs = await uploadImages(files)
  } catch (error) {
    if (!isDestroyed?.()) console.error(error)
    return
  }
  if (isDestroyed?.() || !imgs?.length) return
  const escapeText = (text: string) =>
    text
      .replace(/\r?\n/g, ' ')
      .replace(/&/g, '&amp;')
      .replace(/[\\[\]"*_`<>!]/g, '\\$&')
  // Angle destinations preserve balanced/unbalanced parentheses; encode characters
  // that would terminate the destination or turn it into multiple lines.
  const escapeUrl = (url: string) =>
    url.replace(/[<>\\\s]/g, (char) => encodeURIComponent(char))
  const pos = appendBlock(
    imgs
      .map(({ url, alt, title }, i) => {
        alt = alt ?? files[i]?.name ?? ''
        return `![${escapeText(alt)}](<${escapeUrl(url)}>${
          title ? ` "${escapeText(title)}"` : ''
        })`
      })
      .join('\n\n'),
  )
  editor.setSelection(pos, codemirror.Pos(pos.line + imgs.length * 2 - 2))
  editor.focus()
}

export function getBuiltinActions(
  locale: BytemdLocale,
  plugins: BytemdPlugin[],
  uploadImages: EditorProps['uploadImages'],
): { leftActions: BytemdAction[]; rightActions: BytemdAction[] } {
  const headingAction = (level: number): BytemdAction => ({
    title: locale[`h${level}` as keyof BytemdLocale],
    group: 'heading',

    icon: [
      icons.H1,
      icons.H2,
      icons.H3,
      icons.LevelFourTitle,
      icons.LevelFiveTitle,
      icons.LevelSixTitle,
    ][level - 1],
    cheatsheet:
      level <= 3 ? `${'#'.repeat(level)} ${locale.headingText}` : undefined,
    handler: {
      type: 'action',
      click({ replaceLines, editor }) {
        replaceLines((line) => {
          line = line.trim().replace(/^#*/, '').trim()
          line = '#'.repeat(level) + ' ' + line
          return line
        })
        editor.focus()
      },
    },
  })

  const rangeStyleAction = (
    kind: 'size' | 'color' | 'bg',
    value: string,
    title: string,
    icon?: string,
  ): BytemdAction => {
    const open = `[${kind}=${value}]`
    const close = `[/${kind}]`
    const existingRange = new RegExp(
      `^\\[${kind}=[^\\]]+\\]([\\s\\S]*)\\[\\/${kind}\\]$`,
      'i',
    )

    return {
      title,
      icon,
      handler: {
        type: 'action',
        click({ editor, codemirror }) {
          const selected = editor.getSelection()

          if (selected) {
            const existing = selected.match(existingRange)
            editor.replaceSelection(
              open + (existing ? existing[1] : selected) + close,
            )
            editor.focus()
            return
          }

          const from = editor.getCursor('from')
          const lineText = editor.getLine(from.line) ?? ''
          const prefix =
            lineText.match(
              /^(\s*(?:(?:#{1,6}|>|[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?)*)/,
            )?.[1] ?? ''
          const content = lineText.slice(prefix.length)
          const trailing = content.match(/\s*$/)?.[0] ?? ''
          const body = content.slice(0, content.length - trailing.length)
          const existing = body.match(existingRange)

          if (body) {
            const inner = existing ? existing[1] : body
            const next = open + inner + close
            editor.replaceRange(
              next,
              codemirror.Pos(from.line, prefix.length),
              codemirror.Pos(from.line, prefix.length + body.length),
            )
            editor.setCursor(
              codemirror.Pos(from.line, prefix.length + next.length),
            )
          } else {
            editor.replaceRange(
              open + close,
              codemirror.Pos(from.line, prefix.length),
              codemirror.Pos(from.line, prefix.length),
            )
            editor.setCursor(
              codemirror.Pos(from.line, prefix.length + open.length),
            )
          }
          editor.focus()
        },
      },
    }
  }

  const colorSwatch = (color: string) =>
    `<span class="bytemd-color-swatch" style="background-color:${color}"></span>`
  const fontColors = [
    '#e03131',
    '#f08c00',
    '#2f9e44',
    '#1971c2',
    '#7048e8',
    '#495057',
    '#000000',
  ]
  const bgColors = [
    '#fff3bf',
    '#d3f9d8',
    '#d0ebff',
    '#ffe3e3',
    '#f3d9fa',
    '#e9ecef',
  ]

  const leftActions: BytemdAction[] = [
    {
      title: locale.headingText,
      group: 'heading',
      icon: icons.H,
      handler: {
        type: 'dropdown',
        actions: [4, 5, 6].map(headingAction),
      },
    },
    headingAction(1),
    headingAction(2),
    headingAction(3),
    {
      title: locale.fontSize,
      group: 'style',
      icon: icons.FontSize,
      cheatsheet: `[size=20]${locale.textSample}[/size]`,
      handler: {
        type: 'dropdown',
        actions: [12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((size) =>
          rangeStyleAction('size', String(size), `${size}px`),
        ),
      },
    },
    {
      title: locale.fontColor,
      group: 'style',
      icon: icons.ColorCard,
      cheatsheet: `[color=#e03131]${locale.textSample}[/color]`,
      handler: {
        type: 'dropdown',
        actions: fontColors.map((color) =>
          rangeStyleAction('color', color, color, colorSwatch(color)),
        ),
      },
    },
    {
      title: locale.bgColor,
      group: 'style',
      icon: icons.HighLight,
      cheatsheet: `[bg=#fff3bf]${locale.textSample}[/bg]`,
      handler: {
        type: 'dropdown',
        actions: bgColors.map((color) =>
          rangeStyleAction('bg', color, color, colorSwatch(color)),
        ),
      },
    },
    {
      title: locale.bold,
      group: 'inline',
      icon: icons.TextBold,
      cheatsheet: `**${locale.boldText}**`,
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('B'),
        click({ wrapText, editor }) {
          wrapText('**')
          editor.focus()
        },
      },
    },
    {
      title: locale.italic,
      group: 'inline',
      icon: icons.TextItalic,
      cheatsheet: `*${locale.italicText}*`,
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('I'),
        click({ wrapText, editor }) {
          wrapText('*')
          editor.focus()
        },
      },
    },
    {
      title: locale.quote,
      group: 'inline',
      icon: icons.Quote,
      cheatsheet: `> ${locale.quotedText}`,
      handler: {
        type: 'action',
        click({ replaceLines, editor }) {
          replaceLines((line) => '> ' + line)
          editor.focus()
        },
      },
    },
    {
      title: locale.link,
      group: 'inline',
      icon: icons.LinkOne,
      cheatsheet: `[${locale.linkText}](url)`,
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('K'),
        click({ editor, wrapText, codemirror }) {
          wrapText('[', '](url)')
          const cursor = editor.getCursor()
          editor.setSelection(
            codemirror.Pos(cursor.line, cursor.ch + 2),
            codemirror.Pos(cursor.line, cursor.ch + 5),
          )
          editor.focus()
        },
      },
    },
    {
      title: locale.image,
      group: 'inline',
      icon: icons.Pic,
      cheatsheet: `![${locale.imageAlt}](url "${locale.imageTitle}")`,
      handler: uploadImages
        ? {
            type: 'action',
            shortcut: getShortcutWithPrefix('I', true),
            async click(ctx) {
              const fileList = await selectFiles({
                accept: 'image/*',
                multiple: true,
              })

              if (fileList?.length) {
                await handleImageUpload(ctx, uploadImages, Array.from(fileList))
              }
            },
          }
        : {
            type: 'action',
            shortcut: getShortcutWithPrefix('I', true),
            click({ editor, wrapText, codemirror }) {
              wrapText('![', '](url)')
              const cursor = editor.getCursor()
              editor.setSelection(
                codemirror.Pos(cursor.line, cursor.ch + 2),
                codemirror.Pos(cursor.line, cursor.ch + 5),
              )
              editor.focus()
            },
          },
    },
    {
      title: locale.code,
      group: 'inline',
      icon: icons.Code,
      cheatsheet: '`' + locale.codeText + '`',
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('K', true),
        click({ wrapText, editor }) {
          wrapText('`')
          editor.focus()
        },
      },
    },
    {
      title: locale.codeBlock,
      group: 'inline',
      icon: icons.CodeBrackets,
      cheatsheet: '```' + locale.codeLang + '↵',
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('C', true),
        click({ editor, appendBlock, codemirror }) {
          const pos = appendBlock('```js\n```')
          editor.setSelection(
            codemirror.Pos(pos.line, 3),
            codemirror.Pos(pos.line, 5),
          )
          editor.focus()
        },
      },
    },
    {
      title: locale.ul,
      group: 'block',
      icon: icons.ListTwo,
      cheatsheet: `- ${locale.ulItem}`,
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('U', true),
        click({ replaceLines, editor }) {
          replaceLines((line) => '- ' + line)
          editor.focus()
        },
      },
    },
    {
      title: locale.ol,
      group: 'block',
      icon: icons.OrderedList,
      cheatsheet: `1. ${locale.olItem}`,
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('O', true),
        click({ replaceLines, editor }) {
          replaceLines((line, i) => `${i + 1}. ${line}`)
          editor.focus()
        },
      },
    },
    {
      title: locale.hr,
      group: 'block',
      icon: icons.DividingLine,
      cheatsheet: '---',
      handler: {
        type: 'action',
        click({ editor, appendBlock }) {
          appendBlock('---')
          editor.focus()
        },
      },
    },
    {
      title: locale.hrText,
      group: 'block',
      icon: icons.DividingLineOne,
      cheatsheet: `---${locale.hrTextSample}---`,
      handler: {
        type: 'action',
        click({ editor, appendBlock, codemirror }) {
          const text = locale.hrTextSample
          const { line } = appendBlock(`---${text}---`)
          editor.setSelection(
            codemirror.Pos(line, 3),
            codemirror.Pos(line, 3 + text.length),
          )
          editor.focus()
        },
      },
    },
  ]
  const rightActions: BytemdAction[] = []
  plugins.forEach(({ actions }) => {
    if (actions) {
      actions.forEach((action) => {
        if (!action.position || action.position !== 'right')
          leftActions.push(action)
        else rightActions.unshift(action)
      })
    }
  })
  // 魔改新增：提示块（五种直出）/ 手风琴 / 拼音 / 时间线；
  // 放在插件动作之后，保证自定义功能集中在工具栏末尾
  const calloutActions = [
    { key: 'default', label: locale.calloutDefault, color: '#409eff' },
    { key: 'success', label: locale.calloutSuccess, color: '#67c23a' },
    { key: 'warning', label: locale.calloutWarning, color: '#e6a23c' },
    { key: 'info', label: locale.calloutInfo, color: '#909399' },
    { key: 'danger', label: locale.calloutDanger, color: '#f56c6c' },
  ].map(({ key, label, color }): BytemdAction => ({
    title: label,
    group: 'custom',
    icon: `<span class="bytemd-callout-dot" style="background-color:${color}"></span>`,
    cheatsheet: `>[${key}] ${label}`,
    handler: {
      type: 'action',
      click(ctx: BytemdEditorContext) {
        const { editor } = ctx
        const pos = editor.getCursor()
        const lineText = editor.getLine(pos.line) ?? ''
        const prefix = lineText.trim() === '' ? '' : '\n'
        editor.replaceSelection(`${prefix}>[${key}] `)
        editor.focus()
      },
    },
  }))

  leftActions.push(
    ...calloutActions,
    {
      title: locale.accordion,
      group: 'custom',
      icon: icons.ClickToFold,
      cheatsheet: '+++ 标题↵内容↵+++',
      handler: {
        type: 'action',
        click({ editor, appendBlock, codemirror }) {
          const { line } = appendBlock('+++ 标题\n内容\n+++')
          editor.setSelection(codemirror.Pos(line, 4), codemirror.Pos(line, 6))
          editor.focus()
        },
      },
    },
    {
      title: locale.pinyin,
      group: 'custom',
      icon: icons.Translate,
      cheatsheet: '{汉字|Han Zi}',
      handler: {
        type: 'action',
        click({ editor, codemirror }) {
          const selected = editor.getSelection()
          const from = editor.getCursor('from')
          const pinyin = 'Han Zi'

          if (selected && !selected.includes('\n')) {
            editor.replaceSelection(`{${selected}|${pinyin}}`)
            const start = codemirror.Pos(
              from.line,
              from.ch + selected.length + 2,
            )
            editor.setSelection(
              start,
              codemirror.Pos(start.line, start.ch + pinyin.length),
            )
          } else {
            editor.setCursor(from)
            editor.replaceSelection('{汉字|Han Zi}')
            const start = codemirror.Pos(from.line, from.ch + 1)
            editor.setSelection(start, codemirror.Pos(start.line, start.ch + 2))
          }
          editor.focus()
        },
      },
    },
    {
      title: locale.timeline,
      group: 'custom',
      icon: icons.VerticalTimeline,
      cheatsheet: '::: timeline 标题↵:: [done] 2024-01-01 事项↵:::',
      handler: {
        type: 'action',
        click({ editor, appendBlock, codemirror }) {
          const { line } = appendBlock(
            '::: timeline 时间线\n:: [done] 2024-01-01 事项\n:::',
          )
          editor.setSelection(
            codemirror.Pos(line, 13),
            codemirror.Pos(line, 16),
          )
          editor.focus()
        },
      },
    },
  )
  return {
    leftActions,
    rightActions,
  }
}
