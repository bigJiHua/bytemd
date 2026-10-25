import { icons } from './icons'
import type {
  BytemdPlugin,
  BytemdAction,
  EditorProps,
  BytemdLocale,
  BytemdEditorContext,
} from './types'
import type { Editor, Position } from 'codemirror'
import type CodeMirror from 'codemirror'
import factory from 'codemirror-ssr'
import usePlaceholder from 'codemirror-ssr/addon/display/placeholder.js'
import useContinuelist from 'codemirror-ssr/addon/edit/continuelist.js'
import useOverlay from 'codemirror-ssr/addon/mode/overlay.js'
import useGfm from 'codemirror-ssr/mode/gfm/gfm.js'
import useMarkdown from 'codemirror-ssr/mode/markdown/markdown.js'
import useXml from 'codemirror-ssr/mode/xml/xml.js'
import useYamlFrontmatter from 'codemirror-ssr/mode/yaml-frontmatter/yaml-frontmatter.js'
import useYaml from 'codemirror-ssr/mode/yaml/yaml.js'
import selectFiles from 'select-files'

export function createCodeMirror() {
  const codemirror = factory()
  usePlaceholder(codemirror)
  useOverlay(codemirror)
  useXml(codemirror) // inline html highlight
  useMarkdown(codemirror)
  useGfm(codemirror)
  useYaml(codemirror)
  useYamlFrontmatter(codemirror)
  useContinuelist(codemirror)
  return codemirror
}

export type EditorUtils = ReturnType<typeof createEditorUtils>

export function createEditorUtils(
  codemirror: typeof CodeMirror,
  editor: Editor
) {
  return {
    /**
     * Wrap text with decorators, for example:
     *
     * `text -> *text*`
     */
    wrapText(before: string, after = before) {
      const range = editor.somethingSelected()
        ? editor.listSelections()[0] // only handle the first selection
        : editor.findWordAt(editor.getCursor())

      const from = range.from() // use from/to instead of anchor/head for reverse select
      const to = range.to()
      const text = editor.getRange(from, to)
      const fromBefore = codemirror.Pos(from.line, from.ch - before.length)
      const toAfter = codemirror.Pos(to.line, to.ch + after.length)

      if (
        editor.getRange(fromBefore, from) === before &&
        editor.getRange(to, toAfter) === after
      ) {
        editor.replaceRange(text, fromBefore, toAfter)
        editor.setSelection(
          fromBefore,
          codemirror.Pos(fromBefore.line, fromBefore.ch + text.length)
        )
      } else {
        editor.replaceRange(before + text + after, from, to)

        // select the original text
        const cursor = editor.getCursor()
        editor.setSelection(
          codemirror.Pos(cursor.line, cursor.ch - after.length - text.length),
          codemirror.Pos(cursor.line, cursor.ch - after.length)
        )
      }
    },
    /**
     * replace multiple lines
     *
     * `line -> # line`
     */
    replaceLines(replace: Parameters<Array<string>['map']>[0]) {
      const [selection] = editor.listSelections()

      const range = [
        codemirror.Pos(selection.from().line, 0),
        codemirror.Pos(selection.to().line),
      ] as const
      const lines = editor.getRange(...range).split('\n')
      editor.replaceRange(lines.map(replace).join('\n'), ...range)
      editor.setSelection(...range)
    },
    /**
     * Append a block based on the cursor position
     */
    appendBlock(content: string): Position {
      const cursor = editor.getCursor()
      // find the first blank line

      let emptyLine = -1
      for (let i = cursor.line; i < editor.lineCount(); i++) {
        if (!editor.getLine(i).trim()) {
          emptyLine = i
          break
        }
      }
      if (emptyLine === -1) {
        // insert a new line to the bottom
        editor.replaceRange('\n', codemirror.Pos(editor.lineCount()))
        emptyLine = editor.lineCount()
      }

      editor.replaceRange('\n' + content, codemirror.Pos(emptyLine))
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
  { editor, appendBlock, codemirror }: BytemdEditorContext,
  uploadImages: NonNullable<EditorProps['uploadImages']>,
  files: File[]
) {
  const imgs = await uploadImages(files)
  const pos = appendBlock(
    imgs
      .map(({ url, alt, title }, i) => {
        alt = alt ?? files[i].name
        return `![${alt}](${url}${title ? ` "${title}"` : ''})`
      })
      .join('\n\n')
  )
  editor.setSelection(pos, codemirror.Pos(pos.line + imgs.length * 2 - 2))
  editor.focus()
}

export function getBuiltinActions(
  locale: BytemdLocale,
  plugins: BytemdPlugin[],
  uploadImages: EditorProps['uploadImages']
): { leftActions: BytemdAction[]; rightActions: BytemdAction[] } {
  const headingAction = (level: number): BytemdAction => ({
    title: locale[`h${level}` as keyof BytemdLocale],
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
    icon?: string
  ): BytemdAction => {
    const open = `[${kind}=${value}]`
    const close = `[/${kind}]`
    const existingRange = new RegExp(
      `^\\[${kind}=[^\\]]+\\]([\\s\\S]*)\\[\\/${kind}\\]$`,
      'i'
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
              open + (existing ? existing[1] : selected) + close
            )
            editor.focus()
            return
          }

          const from = editor.getCursor('from')
          const lineText = editor.getLine(from.line) ?? ''
          const prefix =
            lineText.match(
              /^(\s*(?:(?:#{1,6}|>|[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?)*)/
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
              codemirror.Pos(from.line, prefix.length + body.length)
            )
            editor.setCursor(
              codemirror.Pos(from.line, prefix.length + next.length)
            )
          } else {
            editor.replaceRange(
              open + close,
              codemirror.Pos(from.line, prefix.length),
              codemirror.Pos(from.line, prefix.length)
            )
            editor.setCursor(
              codemirror.Pos(from.line, prefix.length + open.length)
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
      icon: icons.FontSize,
      cheatsheet: `[size=20]${locale.textSample}[/size]`,
      handler: {
        type: 'dropdown',
        actions: [12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((size) =>
          rangeStyleAction('size', String(size), `${size}px`)
        ),
      },
    },
    {
      title: locale.fontColor,
      icon: icons.ColorCard,
      cheatsheet: `[color=#e03131]${locale.textSample}[/color]`,
      handler: {
        type: 'dropdown',
        actions: fontColors.map((color) =>
          rangeStyleAction('color', color, color, colorSwatch(color))
        ),
      },
    },
    {
      title: locale.bgColor,
      icon: icons.HighLight,
      cheatsheet: `[bg=#fff3bf]${locale.textSample}[/bg]`,
      handler: {
        type: 'dropdown',
        actions: bgColors.map((color) =>
          rangeStyleAction('bg', color, color, colorSwatch(color))
        ),
      },
    },
    {
      title: locale.bold,
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
            codemirror.Pos(cursor.line, cursor.ch + 5)
          )
          editor.focus()
        },
      },
    },
    {
      title: locale.image,
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
                codemirror.Pos(cursor.line, cursor.ch + 5)
              )
              editor.focus()
            },
          },
    },
    {
      title: locale.code,
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
      icon: icons.CodeBrackets,
      cheatsheet: '```' + locale.codeLang + '↵',
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('C', true),
        click({ editor, appendBlock, codemirror }) {
          const pos = appendBlock('```js\n```')
          editor.setSelection(
            codemirror.Pos(pos.line, 3),
            codemirror.Pos(pos.line, 5)
          )
          editor.focus()
        },
      },
    },
    {
      title: locale.ul,
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
      icon: icons.DividingLineOne,
      cheatsheet: `---${locale.hrTextSample}---`,
      handler: {
        type: 'action',
        click({ editor, appendBlock, codemirror }) {
          const text = locale.hrTextSample
          const { line } = appendBlock(`---${text}---`)
          editor.setSelection(
            codemirror.Pos(line, 3),
            codemirror.Pos(line, 3 + text.length)
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
  ].map(
    ({ key, label, color }): BytemdAction => ({
      title: label,
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
    })
  )

  leftActions.push(
    ...calloutActions,
    {
      title: locale.accordion,
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
              from.ch + selected.length + 2
            )
            editor.setSelection(
              start,
              codemirror.Pos(start.line, start.ch + pinyin.length)
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
      icon: icons.VerticalTimeline,
      cheatsheet: '::: timeline 标题↵:: [done] 2024-01-01 事项↵:::',
      handler: {
        type: 'action',
        click({ editor, appendBlock, codemirror }) {
          const { line } = appendBlock(
            '::: timeline 时间线\n:: [done] 2024-01-01 事项\n:::'
          )
          editor.setSelection(
            codemirror.Pos(line, 13),
            codemirror.Pos(line, 16)
          )
          editor.focus()
        },
      },
    }
  )
  return {
    leftActions,
    rightActions,
  }
}
