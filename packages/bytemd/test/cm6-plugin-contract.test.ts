import Editor from '../src/editor.svelte'
import { render, cleanup, act } from '@testing-library/svelte'

afterEach(cleanup)

// Simulates an out-of-repo plugin written against the documented CM5-shaped
// editor surface. It intentionally touches every API the migration guide
// promises, so adapter regressions fail here before release.
test('third-party plugin can use the documented CM5-shaped editor surface', async () => {
  const seen: Record<string, any> = {}
  const plugin = {
    editorEffect(ctx: any) {
      const { editor, codemirror, wrapText, replaceLines, appendBlock } = ctx
      seen.hasNativeView = !!editor.view?.state?.doc.toString
      seen.pos = codemirror.Pos(0, 1)
      seen.lineNumbersDefault = editor.getOption('lineNumbers')
      editor.setOption('lineNumbers', false)
      seen.lineNumbersAfterSet = editor.getOption('lineNumbers')
      seen.docHasLines = typeof editor.getDoc()?.lines
      editor.setValue('alpha\nbeta')
      editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 })
      seen.selection = editor.getSelection()
      seen.somethingSelected = editor.somethingSelected()
      seen.lineCount = editor.lineCount()
      seen.secondLine = editor.getLine(1)
      seen.offsetRoundTrip = editor.posFromIndex(
        editor.indexFromPos({ line: 1, ch: 2 }),
      )
      seen.heightFinite = Number.isFinite(editor.heightAtLine(1))
      seen.scrollInfo = Object.values(editor.getScrollInfo()).every(
        Number.isFinite,
      )
      seen.ranges = editor.listSelections().length
      const keyMap = { 'Ctrl-X': () => {} }
      editor.addKeyMap(keyMap)
      editor.removeKeyMap(keyMap)
      wrapText('**')
      seen.wrapped = editor.getValue()
      replaceLines((line: string) => `# ${line}`)
      seen.replaced = editor.getValue()
      seen.appendPos = appendBlock('block')
      seen.appended = editor.getValue()
    },
  }

  render(Editor, { value: '', plugins: [plugin], previewDebounce: 0 })
  await act()

  expect(seen.hasNativeView).toBe(true)
  expect(seen.pos).toEqual({ line: 0, ch: 1 })
  expect(seen.lineNumbersDefault).toBe(true)
  expect(seen.lineNumbersAfterSet).toBe(false)
  expect(seen.docHasLines).toBe('number')
  expect(seen.selection).toBe('alpha')
  expect(seen.somethingSelected).toBe(true)
  expect(seen.lineCount).toBe(2)
  expect(seen.secondLine).toBe('beta')
  expect(seen.offsetRoundTrip).toEqual({ line: 1, ch: 2 })
  expect(seen.heightFinite).toBe(true)
  expect(seen.scrollInfo).toBe(true)
  expect(seen.ranges).toBe(1)
  expect(seen.wrapped).toContain('**alpha**')
  expect(seen.replaced).toContain('# **alpha**')
  expect(seen.appendPos).toEqual({ line: 3, ch: 0 })
  expect(seen.appended.trimEnd().endsWith('block')).toBe(true)
})

test('plugin editor effects receive the codemirror factory and root element', async () => {
  const seen: Record<string, any> = {}
  const plugin = {
    editorEffect(ctx: any) {
      seen.rootIsElement = ctx.root instanceof HTMLElement
      seen.hasFactorySignal = typeof ctx.codemirror.signal === 'function'
      seen.isDestroyed = ctx.isDestroyed?.()
    },
  }

  render(Editor, { value: 'x', plugins: [plugin], previewDebounce: 0 })
  await act()

  expect(seen.rootIsElement).toBe(true)
  expect(seen.hasFactorySignal).toBe(true)
  expect(seen.isDestroyed).toBe(false)
})
