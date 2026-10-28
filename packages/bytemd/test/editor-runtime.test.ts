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
  const selection = editor.listSelections()
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
  expect(editor.listSelections()).toEqual(selection)
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
  // Test factory listeners without Svelte/tooltips' own window subscriptions.
  const addListener = vi.spyOn(window, 'addEventListener')
  const target = document.createElement('div')
  document.body.appendChild(target)
  try {
    createCodeMirror()(target, { value: 'Third independent document' })
    expect(
      addListener.mock.calls.filter(
        ([event]) => event === 'resize' || event === 'blur',
      ),
    ).toHaveLength(0)
  } finally {
    target.remove()
    addListener.mockRestore()
  }
})

test('destroying a focused editor cancels its repeating cursor timer immediately', async () => {
  const timers = new Set<ReturnType<typeof setInterval>>()
  const start = globalThis.setInterval
  const stop = globalThis.clearInterval
  const intervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((
    fn: any,
    ms: number,
    ...args: any[]
  ) => {
    const timer = start(fn, ms, ...args)
    if (ms === 530) timers.add(timer)
    return timer
  }) as any)
  const clearSpy = vi
    .spyOn(globalThis, 'clearInterval')
    .mockImplementation((timer: any) => {
      timers.delete(timer)
      stop(timer)
    })
  try {
    const mounted = render(Editor, { value: 'Focused document' })
    await act()
    const editor = (mounted.container.querySelector('.CodeMirror') as any)
      .CodeMirror
    editor.getInputField().focus()
    expect(timers.size).toBeGreaterThan(0)
    mounted.unmount()
    expect(timers.size).toBe(0)
  } finally {
    intervalSpy.mockRestore()
    clearSpy.mockRestore()
  }
})

test.each(['selection', 'drag'])(
  'destroying an editor during mouse %s releases its document listeners and keeps peers active',
  async (interaction) => {
    // Give CM's measuring node and text ranges geometry; jsdom has no layout.
    const height = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return (this.querySelectorAll('br').length + 1) * 16
      })
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        top: 0,
        left: 0,
        right: 0,
        bottom: 16,
        width: 0,
        height: 16,
      } as DOMRect)
    const originalRange = document.createRange.bind(document)
    const rangeSpy = vi
      .spyOn(document, 'createRange')
      .mockImplementation(() => {
        const range = originalRange()
        range.getBoundingClientRect = () =>
          ({
            top: 0,
            left: range.startOffset * 8,
            right: Math.max(range.startOffset + 1, range.endOffset) * 8,
            bottom: 16,
            width: 8,
            height: 16,
          }) as DOMRect
        range.getClientRects = () => [] as any
        return range
      })
    const windowFocus = vi.spyOn(window, 'focus').mockImplementation(() => {})
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const mounted = render(Editor, { value: 'one\ntwo\nthree' })
    const peer = render(Editor, { value: 'peer' })
    await act()
    const mirrors = document.querySelectorAll('.CodeMirror')
    const editor = (mirrors[0] as any).CodeMirror
    const peerEditor = (mirrors[1] as any).CodeMirror
    const begin = (mirror: any, clientX = 12) => {
      const event = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY: 5,
      })
      Object.defineProperty(event, 'which', { value: 1 })
      mirror
        .getWrapperElement()
        .querySelector('.CodeMirror-lines')
        .dispatchEvent(event)
    }
    try {
      begin(peerEditor, 2)
      const peerCancel = peerEditor.state.selectingText
      const peerDoc = peerEditor.getDoc()
      const peerSelection = peerEditor.listSelections()
      expect(typeof peerCancel).toBe('function')
      if (interaction === 'drag')
        editor.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 3 })
      begin(editor)
      const state = interaction === 'drag' ? 'draggingText' : 'selectingText'
      expect(typeof editor.state[state]).toBe('function')
      const ownListeners = add.mock.calls
        .filter(([type]) => type === 'mousemove' || type === 'mouseup')
        .slice(-2)
      expect(ownListeners).toHaveLength(2)
      const doc = editor.getDoc()
      const value = editor.getValue()
      const change = vi.fn()
      editor.on('change', change)
      mounted.unmount()
      expect(editor.state[state]).toBe(false)
      expect(editor.getWrapperElement().isConnected).toBe(false)
      for (const [type, listener] of ownListeners)
        expect(
          remove.mock.calls.some(
            ([event, callback]) => event === type && callback === listener,
          ),
        ).toBe(true)
      expect(peerEditor.state.selectingText).toBe(peerCancel)
      expect(peerEditor.getDoc()).toBe(peerDoc)
      expect(peerEditor.listSelections()).toEqual(peerSelection)
      expect(peerEditor.getValue()).toBe('peer')
      expect(editor.getDoc()).toBe(doc)
      expect(editor.getValue()).toBe(value)
      const focus = vi.spyOn(editor.getInputField(), 'focus')
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(focus).not.toHaveBeenCalled()
      expect(change).not.toHaveBeenCalled()
      editor.off('change', change)
      focus.mockRestore()
    } finally {
      mounted.unmount()
      peer.unmount()
      rangeSpy.mockRestore()
      windowFocus.mockRestore()
      add.mockRestore()
      remove.mockRestore()
      height.mockRestore()
      bounds.mockRestore()
    }
  },
)
