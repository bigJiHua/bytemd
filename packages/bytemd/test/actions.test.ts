/// <reference types="vitest/globals" />
import en from '../locales/en.json'
import { getBuiltinActions } from '../src/editor'

const { leftActions } = getBuiltinActions(en, [], undefined)
const action = (title: string) =>
  leftActions.find((item) => item.title === title)

function makeContext(selected = '') {
  const inserted: string[] = []
  const selections: any[] = []
  const editor = {
    getSelection: vi.fn(() => selected),
    getCursor: vi.fn(() => ({ line: 0, ch: 0 })),
    getLine: vi.fn(() => ''),
    replaceSelection: vi.fn((text: string) => inserted.push(text)),
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
  for (const title of ['手风琴', '拼音', '时间线']) {
    const item = action(title)
    expect(item).toBeTruthy()
    expect(item?.icon).toContain('<svg')
    expect(item?.cheatsheet).toBeTruthy()
  }

  for (const title of ['默认', '成功', '警告', '信息', '重要']) {
    const item = action(title)
    expect(item?.icon).toContain('bytemd-callout-dot')
    expect(item?.cheatsheet).toBeTruthy()
    expect(item?.handler?.type).toBe('action')
  }
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
  const { appendBlock, selections } = click('手风琴')

  expect(appendBlock).toHaveBeenCalledWith('+++ 标题\n内容\n+++')
  expect(selections[0]).toEqual([
    { line: 0, ch: 4 },
    { line: 0, ch: 6 },
  ])
})

test('pinyin action without selection selects the base text', () => {
  const { inserted, selections } = click('拼音')

  expect(inserted[0]).toBe('{汉字|Han Zi}')
  expect(selections[0]).toEqual([
    { line: 0, ch: 1 },
    { line: 0, ch: 3 },
  ])
})

test('pinyin action wraps a selection and selects the pinyin', () => {
  const { inserted, selections } = click('拼音', '西安')

  expect(inserted[0]).toBe('{西安|Han Zi}')
  expect(selections[0]).toEqual([
    { line: 0, ch: 4 },
    { line: 0, ch: 10 },
  ])
})

test('timeline action inserts a template and selects its title', () => {
  const { appendBlock, selections } = click('时间线')

  expect(appendBlock).toHaveBeenCalledWith(
    '::: timeline 时间线\n:: [done] 2024-01-01 事项\n:::'
  )
  expect(selections[0]).toEqual([
    { line: 0, ch: 13 },
    { line: 0, ch: 16 },
  ])
})
