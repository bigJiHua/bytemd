import { Editor, Viewer, getProcessor } from '../src'
import {
  createCodeMirror,
  createEditorUtils,
  handleImageUpload,
} from '../src/editor'
import { copyCodeFromButton } from '../src/utils'
import { render, act, cleanup } from '@testing-library/svelte'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function codeMirror(result: ReturnType<typeof render>) {
  return (result.container.querySelector('.CodeMirror') as any).CodeMirror
}

test('host value updates emit the complete new value once', async () => {
  const result = render(Editor, { value: 'old' })
  const changed = vi.fn()
  result.component.$on('change', changed)
  await act()
  result.component.$set({ value: 'new' })
  await act()
  expect(changed).toHaveBeenCalledTimes(1)
  expect(changed.mock.calls[0][0].detail.value).toBe('new')
})

test('changing previewDebounce to zero takes effect for subsequent input', async () => {
  vi.useFakeTimers()
  const result = render(Editor, { value: 'old', previewDebounce: 300 })
  await act()
  await vi.advanceTimersByTimeAsync(300)
  result.component.$set({ value: 'new', previewDebounce: 0 })
  await act()
  await vi.advanceTimersByTimeAsync(1)
  expect(result.container.querySelector('.markdown-body')?.textContent).toBe(
    'new'
  )
})

test('destroying an editor cancels pending overridePreview work', async () => {
  vi.useFakeTimers()
  const overridePreview = vi.fn()
  const result = render(Editor, {
    value: 'old',
    previewDebounce: 300,
    overridePreview,
  })
  await act()
  result.component.$set({ value: 'pending' })
  await act()
  result.unmount()
  await vi.advanceTimersByTimeAsync(400)
  expect(overridePreview).not.toHaveBeenCalled()
})

test('multi-line bold wrapping keeps the original selected text selected', async () => {
  const result = render(Editor, { value: 'first\nsecond' })
  await act()
  const editor = codeMirror(result)
  const codemirror = createCodeMirror()
  editor.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 6 })
  createEditorUtils(codemirror, editor).wrapText('**')
  expect(editor.getValue()).toBe('**first\nsecond**')
  expect(editor.getSelection()).toBe('first\nsecond')
})

test('uploading a filename with Markdown delimiters keeps it as one image', async () => {
  const result = render(Editor, { value: '' })
  await act()
  const editor = codeMirror(result)
  const codemirror = createCodeMirror()
  const context = {
    editor,
    codemirror,
    root: result.container,
    ...createEditorUtils(codemirror, editor),
  }
  const file = new File(['image'], 'pic](unwanted.png) ![x.png', {
    type: 'image/png',
  })
  vi.spyOn(window, 'focus').mockImplementation(() => {})
  await handleImageUpload(
    context,
    async () => [{ url: 'https://example.invalid/photo.png' }],
    [file]
  )
  const html = String(getProcessor({}).processSync(context.editor.getValue()))
  const root = document.createElement('div')
  root.innerHTML = html
  expect(root.querySelectorAll('img')).toHaveLength(1)
  expect(root.querySelector('img')?.getAttribute('src')).toBe(
    'https://example.invalid/photo.png'
  )
  expect(root.querySelector('img')?.getAttribute('alt')).toBe(file.name)
})

test('copy fallback does not report success when execCommand returns false', () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    configurable: true,
  })
  Object.defineProperty(document, 'execCommand', {
    value: vi.fn(() => false),
    configurable: true,
  })
  const root = document.createElement('div')
  root.innerHTML =
    '<pre><code>sample</code><button class="bytemd-copy-btn">复制</button></pre>'
  const button = root.querySelector('button')!
  copyCodeFromButton(button)
  expect(button.textContent).not.toBe('已复制')
})

test('malformed anchor text is handled without an invalid CSS selector', async () => {
  const result = render(Viewer, { value: '<a href="#&quot;">broken</a>' })
  await act()
  const errors: unknown[] = []
  const onError = (event: ErrorEvent) => {
    event.preventDefault()
    errors.push(event.error)
  }
  window.addEventListener('error', onError)
  try {
    result.container.querySelector('a')!.click()
  } finally {
    window.removeEventListener('error', onError)
  }
  expect(errors).toHaveLength(0)
})

test('scroll synchronization tolerates a viewer plugin removing a block', async () => {
  const result = render(Editor, {
    value: '# title\n\nparagraph',
    plugins: [
      {
        viewerEffect: ({ markdownBody }: any) => {
          markdownBody.firstElementChild?.remove()
        },
      },
    ],
  })
  await act()
  const editor = codeMirror(result)
  const codemirror = createCodeMirror()
  expect(() => codemirror.signal(editor, 'scroll', editor)).not.toThrow()
})

test.each([
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[click](javascript:alert%281%29)',
  '<svg onload=alert(1)><a href="javascript:alert(1)">x</a></svg>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<span style="background:url(javascript:alert(1))" onclick="alert(1)">x</span>',
  '[color=red;background:url(javascript:alert(1))]x[/color]',
])('default pipeline removes executable markup: %s', (value) => {
  const root = document.createElement('div')
  root.innerHTML = String(getProcessor({}).processSync(value))
  expect(
    root.querySelector('script,iframe,svg,[onerror],[onclick],[onload]')
  ).toBeNull()
  for (const element of root.querySelectorAll('*')) {
    expect(element.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
    expect(element.getAttribute('style') ?? '').not.toMatch(/url\(/i)
  }
})

test('rehype plugins run after sanitization and are a trusted boundary', () => {
  const plugin = {
    rehype: (processor: any) =>
      processor.use(() => (tree: any) => {
        tree.children.push({
          type: 'element',
          tagName: 'script',
          properties: {},
          children: [{ type: 'text', value: 'alert(1)' }],
        })
      }),
  }
  expect(
    String(getProcessor({ plugins: [plugin] }).processSync('safe'))
  ).toContain('<script>alert(1)</script>')
})

test('deeply nested inline syntax is rejected safely instead of overflowing the stack', () => {
  const value = '[size=20]'.repeat(4096) + 'text' + '[/size]'.repeat(4096)
  expect(() => getProcessor({}).processSync(value)).not.toThrow()
})

test('render failures do not silently leave the previous preview on screen', async () => {
  const result = render(Viewer, { value: 'previous preview' })
  await act()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  result.component.$set({
    value: '[size=20]'.repeat(4096) + 'new content' + '[/size]'.repeat(4096),
  })
  await act()
  expect(
    result.container.querySelector('.markdown-body')?.textContent
  ).not.toBe('previous preview')
})

test('contiguous accordion content can contain ordinary Markdown emphasis', () => {
  const root = document.createElement('div')
  root.innerHTML = String(
    getProcessor({}).processSync('+++ Title\n**bold**\n+++')
  )
  expect(
    root.querySelector('details.bytemd-accordion-item strong')?.textContent
  ).toBe('bold')
})

test('reverse multiline wrapping toggles and preserves selection direction', async () => {
  const result = render(Editor, { value: 'first\nsecond' })
  await act()
  const editor = codeMirror(result)
  const utils = createEditorUtils(createCodeMirror(), editor)
  editor.setSelection({ line: 1, ch: 6 }, { line: 0, ch: 0 })
  utils.wrapText('**')
  expect(editor.getSelection()).toBe('first\nsecond')
  expect(editor.getCursor('anchor').line).toBe(1)
  utils.wrapText('**')
  expect(editor.getValue()).toBe('first\nsecond')
  expect(editor.getSelection()).toBe('first\nsecond')
  expect(editor.getCursor('anchor').line).toBe(1)
})

test('changing debounce back to a delay cancels obsolete work', async () => {
  vi.useFakeTimers()
  const result = render(Editor, { value: 'old', previewDebounce: 0 })
  await act()
  await vi.advanceTimersByTimeAsync(1)
  result.component.$set({ value: 'pending', previewDebounce: 300 })
  await act()
  await vi.advanceTimersByTimeAsync(1)
  expect(result.container.querySelector('.markdown-body')?.textContent).toBe(
    'old'
  )
  result.component.$set({ value: 'latest' })
  await act()
  await vi.advanceTimersByTimeAsync(300)
  expect(result.container.querySelector('.markdown-body')?.textContent).toBe(
    'latest'
  )
})

test('failed and empty uploads and completion after unmount do not edit', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const result = render(Editor, { value: 'original' })
  await act()
  const editor = codeMirror(result)
  let destroyed = false
  const context = {
    editor,
    codemirror: createCodeMirror(),
    root: result.container,
    ...createEditorUtils(createCodeMirror(), editor),
    isDestroyed: () => destroyed,
  }
  const files = [new File(['x'], 'image.png', { type: 'image/png' })]
  await handleImageUpload(context, async () => [], files)
  await handleImageUpload(
    context,
    async () => {
      throw new Error('upload failed')
    },
    files
  )
  expect(editor.getValue()).toBe('original')
  let finish!: (value: any) => void
  const pending = handleImageUpload(
    context,
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    files
  )
  destroyed = true
  result.unmount()
  finish([{ url: 'photo.png' }])
  await pending
  expect(editor.getValue()).toBe('original')
})

test('uploads preserve special alt/title and parentheses in URLs', async () => {
  vi.spyOn(window, 'focus').mockImplementation(() => {})
  const result = render(Editor, { value: '' })
  await act()
  const editor = codeMirror(result)
  const cm = createCodeMirror()
  const context = {
    editor,
    codemirror: cm,
    root: result.container,
    ...createEditorUtils(cm, editor),
  }
  const alt = 'a[b] *bold* &copy; `code`'
  const title = 'a "quote" \\ title'
  await handleImageUpload(
    context,
    async () => [{ url: 'https://example.invalid/a(b).png', alt, title }],
    [new File(['x'], 'x.png')]
  )
  const root = document.createElement('div')
  root.innerHTML = String(getProcessor({}).processSync(editor.getValue()))
  expect(root.querySelectorAll('img')).toHaveLength(1)
  expect(root.querySelector('img')?.getAttribute('alt')).toBe(alt)
  expect(root.querySelector('img')?.getAttribute('title')).toBe(title)
  expect(root.querySelector('img')?.getAttribute('src')).toBe(
    'https://example.invalid/a(b).png'
  )
})

test.each([64, 65, 4096])(
  'inline style depth %i renders or degrades without losing text',
  (depth) => {
    const source =
      '[size=20]'.repeat(depth) + 'content' + '[/size]'.repeat(depth)
    const root = document.createElement('div')
    root.innerHTML = String(getProcessor({}).processSync(source))
    expect(root.textContent).toBe(depth > 64 ? source : 'content')
    expect(root.querySelectorAll('span')).toHaveLength(depth > 64 ? 0 : depth)
  }
)

test('wide inline style input degrades under its node budget', () => {
  const source = '[size=20]x[/size]'.repeat(10001)
  const root = document.createElement('div')
  root.innerHTML = String(getProcessor({}).processSync(source))
  expect(root.textContent).toBe(source)
  expect(root.querySelector('span')).toBeNull()
})

test('accordion preserves lists and fenced code without blank marker lines', () => {
  const root = document.createElement('div')
  root.innerHTML = String(
    getProcessor({}).processSync(
      '+++ Title\n- **one**\n- two\n```js\nconsole.log(1)\n```\n+++'
    )
  )
  expect(root.querySelector('details ul strong')?.textContent).toBe('one')
  expect(root.querySelector('details pre code')?.textContent).toBe(
    'console.log(1)\n'
  )
})
