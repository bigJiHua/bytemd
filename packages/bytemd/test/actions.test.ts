/// <reference types="vitest/globals" />
import en from '../locales/en.json'
import zhHans from '../locales/zh_Hans.json'
import { getBuiltinActions } from '../src/editor'

const { leftActions } = getBuiltinActions(en, [], undefined)
const action = (title: string) =>
  leftActions.find((item) => item.title === title)

function makeContext(selected = '', lineText = '') {
  const inserted: string[] = []
  const selections: any[] = []
  const editor = {
    getSelection: vi.fn(() => selected),
    getCursor: vi.fn((which?: string) => ({
      line: 0,
      ch: which === 'to' ? selected.length : 0,
    })),
    getLine: vi.fn(() => lineText),
    replaceSelection: vi.fn((text: string) => inserted.push(text)),
    replaceRange: vi.fn((text: string) => inserted.push(text)),
    setSelection: vi.fn((from: any, to: any) => selections.push([from, to])),
    setCursor: vi.fn(),
    focus: vi.fn(),
  }
  const appendBlock = vi.fn(() => ({ line: 0, ch: 0 }))
  const wrapText = vi.fn()
  const context = {
    editor,
    codemirror: { Pos: (line: number, ch: number) => ({ line, ch }) },
    appendBlock,
    wrapText,
  }
  return { context, inserted, selections, appendBlock, wrapText }
}

function click(actionTitle: string, selected = '') {
  const item = action(actionTitle)
  expect(item?.handler?.type).toBe('action')
  if (item?.handler?.type !== 'action') throw new Error('not an action')

  const ctx = makeContext(selected)
  item.handler.click(ctx.context as any)
  return ctx
}

test('custom toolbar actions carry icons and cheatsheets', () => {
  for (const title of [
    en.accordion,
    en.pinyin,
    en.timeline,
    en.fontSize,
    en.fontColor,
    en.bgColor,
    en.hrText,
  ]) {
    const item = action(title)
    expect(item).toBeTruthy()
    expect(item?.icon).toContain('<svg')
    expect(item?.cheatsheet).toBeTruthy()
  }

  for (const title of [
    en.calloutDefault,
    en.calloutSuccess,
    en.calloutWarning,
    en.calloutInfo,
    en.calloutDanger,
  ]) {
    const item = action(title)
    expect(item?.icon).toContain('bytemd-callout-dot')
    expect(item?.cheatsheet).toBeTruthy()
    expect(item?.handler?.type).toBe('action')
  }
})

test('custom action labels follow the locale', () => {
  const { leftActions: zhActions } = getBuiltinActions(zhHans, [], undefined)
  const titles = zhActions.map((item) => item.title)

  for (const title of [
    zhHans.accordion,
    zhHans.pinyin,
    zhHans.timeline,
    zhHans.fontSize,
    zhHans.fontColor,
    zhHans.bgColor,
    zhHans.hrText,
    zhHans.calloutDefault,
    zhHans.calloutDanger,
  ]) {
    expect(titles).toContain(title)
  }
})

test('font size action wraps the selection or the current line', () => {
  const fontSize = action(en.fontSize)
  expect(fontSize?.handler?.type).toBe('dropdown')
  if (fontSize?.handler?.type !== 'dropdown') throw new Error('not a dropdown')

  const size20 = fontSize.handler.actions.find((item) => item.title === '20px')
  if (size20?.handler?.type !== 'action') throw new Error('not an action')

  const selected = makeContext('重点')
  size20.handler.click(selected.context as any)
  expect(selected.inserted).toEqual(['[size=20]重点[/size]'])

  const reusable = makeContext('[size=12]重点[/size]')
  size20.handler.click(reusable.context as any)
  expect(reusable.inserted).toEqual(['[size=20]重点[/size]'])

  const line = makeContext('', '## 标题')
  size20.handler.click(line.context as any)
  expect(line.inserted).toEqual(['[size=20]标题[/size]'])

  const wrapped = makeContext('', '- [ ] [size=12]任务[/size]')
  size20.handler.click(wrapped.context as any)
  expect(wrapped.inserted).toEqual(['[size=20]任务[/size]'])
})

test('color actions wrap the selection or the current line', () => {
  const selected = makeContext('重点')
  const fontColor = action(en.fontColor)
  if (fontColor?.handler?.type !== 'dropdown') throw new Error('not a dropdown')
  const red = fontColor.handler.actions.find((item) => item.title === '#e03131')
  if (red?.handler?.type !== 'action') throw new Error('not an action')
  red.handler.click(selected.context as any)
  expect(selected.inserted).toEqual(['[color=#e03131]重点[/color]'])

  const line = makeContext('', '## 标题')
  const bgColor = action(en.bgColor)
  if (bgColor?.handler?.type !== 'dropdown') throw new Error('not a dropdown')
  const yellow = bgColor.handler.actions.find(
    (item) => item.title === '#fff3bf'
  )
  if (yellow?.handler?.type !== 'action') throw new Error('not an action')
  yellow.handler.click(line.context as any)
  expect(line.inserted).toEqual(['[bg=#fff3bf]标题[/bg]'])
})

test('text divider action inserts the template and selects the label', () => {
  const item = action(en.hrText)
  if (item?.handler?.type !== 'action') throw new Error('not an action')

  const ctx = makeContext()
  item.handler.click(ctx.context as any)

  expect(ctx.appendBlock).toHaveBeenCalledWith(
    `---${en.hrTextSample}---`
  )
  expect(ctx.selections[0]).toEqual([
    { line: 0, ch: 3 },
    { line: 0, ch: 3 + en.hrTextSample.length },
  ])
})

test('heading levels 1-3 are direct and 4-6 stay in a dropdown', () => {
  for (const title of [en.h1, en.h2, en.h3]) {
    const item = action(title)
    expect(item?.handler?.type).toBe('action')
    expect(item?.cheatsheet).toBeTruthy()
  }

  const more = leftActions.find((item) => item.title === en.headingText)
  expect(more?.handler?.type).toBe('dropdown')
  if (more?.handler?.type !== 'dropdown') throw new Error('no heading menu')
  expect(more.handler.actions.map((item) => item.title)).toEqual([
    en.h4,
    en.h5,
    en.h6,
  ])
})

test('every cheatsheet in Help has a toolbar handler and icon', () => {
  const check = (items: typeof leftActions) => {
    items.forEach((item) => {
      if (item.cheatsheet) {
        expect(item.handler).toBeTruthy()
        expect(item.icon).toBeTruthy()
      }
      if (item.handler?.type === 'dropdown') check(item.handler.actions)
    })
  }
  check(leftActions)

  expect(action(en.hr)?.handler).toBeTruthy()
  expect(action(en.image)?.handler).toBeTruthy()
})

test('horizontal rule action appends ---', () => {
  const { appendBlock } = click(en.hr)

  expect(appendBlock).toHaveBeenCalledWith('---')
})

test('image action falls back to markdown without uploadImages', () => {
  const { wrapText, selections } = click(en.image)

  expect(wrapText).toHaveBeenCalledWith('![', '](url)')
  expect(selections[0]).toEqual([
    { line: 0, ch: 2 },
    { line: 0, ch: 5 },
  ])
})

test('accordion action inserts a template and selects the title', () => {
  const { appendBlock, selections } = click(en.accordion)

  expect(appendBlock).toHaveBeenCalledWith('+++ 标题\n内容\n+++')
  expect(selections[0]).toEqual([
    { line: 0, ch: 4 },
    { line: 0, ch: 6 },
  ])
})

test('pinyin action without selection selects the base text', () => {
  const { inserted, selections } = click(en.pinyin)

  expect(inserted[0]).toBe('{汉字|Han Zi}')
  expect(selections[0]).toEqual([
    { line: 0, ch: 1 },
    { line: 0, ch: 3 },
  ])
})

test('pinyin action wraps a selection and selects the pinyin', () => {
  const { inserted, selections } = click(en.pinyin, '西安')

  expect(inserted[0]).toBe('{西安|Han Zi}')
  expect(selections[0]).toEqual([
    { line: 0, ch: 4 },
    { line: 0, ch: 10 },
  ])
})

test('timeline action inserts a template and selects its title', () => {
  const { appendBlock, selections } = click(en.timeline)

  expect(appendBlock).toHaveBeenCalledWith(
    '::: timeline 时间线\n:: [done] 2024-01-01 事项\n:::'
  )
  expect(selections[0]).toEqual([
    { line: 0, ch: 13 },
    { line: 0, ch: 16 },
  ])
})
