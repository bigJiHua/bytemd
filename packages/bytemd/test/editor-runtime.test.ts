import { createCodeMirror } from '../src/editor'
import Editor from '../src/editor.svelte'
import { render, cleanup, act } from '@testing-library/svelte'

afterEach(cleanup)

test('layout containment is opt-in and toggles without replacing the document or selection', async () => {
  const mounted = render(Editor, { value: '# Heading', previewDebounce: 0 })
  await act()
  const editor = (mounted.container.querySelector('.CodeMirror') as any)
    .CodeMirror
  const doc = editor.getDoc()
  editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 5 })
  const selection = editor
    .listSelections()
    .map((range: any) => [range.anchor, range.head])
  expect(mounted.container.querySelector('.bytemd-body-contained')).toBeNull()
  await mounted.rerender({ layoutContainment: true })
  await act()
  expect(
    mounted.container.querySelector('.bytemd-body-contained'),
  ).not.toBeNull()
  await mounted.rerender({ layoutContainment: false })
  await act()
  expect(mounted.container.querySelector('.bytemd-body-contained')).toBeNull()
  expect(editor.getDoc()).toBe(doc)
  expect(editor.getValue()).toBe('# Heading')
  expect(
    editor.listSelections().map((range: any) => [range.anchor, range.head]),
  ).toEqual(selection)
})

test('large documents warn once unless containment or the warning is disabled', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const large = 'x'.repeat(200)
  try {
    render(Editor, {
      value: large,
      previewDebounce: 0,
      largeDocumentThreshold: 100,
    })
    await act()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('layoutContainment')

    cleanup()
    render(Editor, {
      value: large,
      previewDebounce: 0,
      largeDocumentThreshold: 100,
      layoutContainment: true,
    })
    await act()
    expect(warn).toHaveBeenCalledTimes(1)

    cleanup()
    render(Editor, {
      value: large,
      previewDebounce: 0,
      largeDocumentThreshold: 100,
      largeDocumentWarning: false,
    })
    await act()
    expect(warn).toHaveBeenCalledTimes(1)

    cleanup()
    render(Editor, {
      value: 'short',
      previewDebounce: 0,
      largeDocumentThreshold: 100,
    })
    await act()
    expect(warn).toHaveBeenCalledTimes(1)
  } finally {
    warn.mockRestore()
    cleanup()
  }
})

test('one initialized CodeMirror runtime serves independent editor documents', async () => {
  const firstRuntime = createCodeMirror()
  const first = render(Editor, {
    value: 'First',
    editorConfig: { lineNumbers: true },
  })
  const second = render(Editor, {
    value: 'Second',
    editorConfig: { lineNumbers: false },
  })
  await act()
  // Testing Library's default container is shared; select both actual instances.
  const mirrors = document.querySelectorAll('.CodeMirror')
  const a = (mirrors[0] as any).CodeMirror
  const b = (mirrors[1] as any).CodeMirror
  expect(createCodeMirror()).toBe(firstRuntime)
  expect(a.getDoc()).not.toBe(b.getDoc())
  a.replaceRange(' edited', { line: 0, ch: 5 })
  expect(b.getValue()).toBe('Second')
  expect(a.getOption('lineNumbers')).toBe(true)
  expect(b.getOption('lineNumbers')).toBe(false)
  const target = document.createElement('div')
  document.body.appendChild(target)
  try {
    const third = createCodeMirror()(target, {
      value: 'Third independent document',
    })
    expect(third.getValue()).toBe('Third independent document')
    third.destroy()
    expect(third.view.dom.isConnected).toBe(false)
  } finally {
    target.remove()
  }
})

test('destroying a focused editor releases the view and keeps peers intact', async () => {
  const mounted = render(Editor, { value: 'Focused document' })
  const peer = render(Editor, { value: 'peer' })
  await act()
  const mirrors = document.querySelectorAll('.CodeMirror')
  const editor = (mirrors[0] as any).CodeMirror
  const peerEditor = (mirrors[1] as any).CodeMirror
  const view = editor.view
  const peerDoc = peerEditor.getDoc()
  const peerSelection = peerEditor
    .listSelections()
    .map((range: any) => [range.anchor, range.head])

  editor.getInputField().focus()
  mounted.unmount()

  expect(view.dom.isConnected).toBe(false)
  expect(peerEditor.getDoc()).toBe(peerDoc)
  expect(
    peerEditor.listSelections().map((range: any) => [range.anchor, range.head]),
  ).toEqual(peerSelection)
  expect(peerEditor.getValue()).toBe('peer')
  peer.unmount()
})

test.each(['selection', 'drag'])(
  'destroying an editor during %s keeps peers active',
  async (interaction) => {
    const mounted = render(Editor, { value: 'one\ntwo\nthree' })
    const peer = render(Editor, { value: 'peer' })
    await act()
    const mirrors = document.querySelectorAll('.CodeMirror')
    const editor = (mirrors[0] as any).CodeMirror
    const peerEditor = (mirrors[1] as any).CodeMirror
    const peerDoc = peerEditor.getDoc()
    const peerValue = peerEditor.getValue()
    const peerSelection = peerEditor
      .listSelections()
      .map((range: any) => [range.anchor, range.head])

    if (interaction === 'drag') {
      editor.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 3 })
    } else {
      editor.setSelection({ line: 0, ch: 1 }, { line: 0, ch: 3 })
    }
    const change = vi.fn()
    editor.on('change', change)
    const view = editor.view
    const value = editor.getValue()

    mounted.unmount()

    expect(view.dom.isConnected).toBe(false)
    expect(editor.getValue()).toBe(value)
    expect(change).not.toHaveBeenCalled()
    expect(peerEditor.getDoc()).toBe(peerDoc)
    expect(peerEditor.getValue()).toBe(peerValue)
    expect(
      peerEditor
        .listSelections()
        .map((range: any) => [range.anchor, range.head]),
    ).toEqual(peerSelection)
    peer.unmount()
  },
)
