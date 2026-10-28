import highlight from '../../plugin-highlight/src'
import math from '../../plugin-math/src'
import Viewer from '../src/viewer.svelte'
import { render, act, cleanup, waitFor } from '@testing-library/svelte'
import H from 'highlight.js'
import K from 'katex'

vi.mock('katex', () => ({
  default: { render: vi.fn() },
}))
vi.mock('highlight.js', () => ({
  default: { highlightElement: vi.fn() },
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('math failures preserve source and continue with other expressions', async () => {
  vi.mocked(K.render).mockImplementation((source, el, options) => {
    el.textContent = 'partial output'
    if (source === 'bad' && options?.throwOnError) throw new Error('failed')
    el.innerHTML = `<span class="katex">${source}</span>`
  })
  const result = render(Viewer, {
    value: '$bad$ and $good$',
    plugins: [math()],
  })
  await waitFor(() => expect(K.render).toHaveBeenCalledTimes(2))
  expect(
    result.container.querySelector('code.language-math')?.textContent,
  ).toBe('bad')
  expect(result.container.querySelector('.katex')?.textContent).toBe('good')
  expect(
    result.container.querySelectorAll('.bytemd-plugin-error'),
  ).toHaveLength(1)
  expect(result.container.querySelector('p p')).toBeNull()
})

test('KaTeX parse-error output receives the same fallback feedback', async () => {
  vi.mocked(K.render).mockImplementation((source, el) => {
    el.innerHTML =
      '<span class="katex-error" title="Invalid formula">error</span>'
  })
  const result = render(Viewer, { value: '$invalid$', plugins: [math()] })
  await waitFor(() =>
    expect(result.container.querySelector('[role="alert"]')).not.toBeNull(),
  )
  expect(
    result.container.querySelector('code.language-math')?.textContent,
  ).toBe('invalid')
  expect(result.container.querySelector('.katex-error')).toBeNull()
})

test('math cleanup restores source for locale changes and discards late loading', async () => {
  vi.mocked(K.render).mockImplementation((source, el) => {
    el.innerHTML = `<span class="katex">rendered</span>`
  })
  const plugins = [math()]
  const result = render(Viewer, { value: '$original$', plugins })
  await waitFor(() => expect(K.render).toHaveBeenCalledOnce())
  await result.rerender({ locale: { pluginError: '中文' } })
  await waitFor(() => expect(K.render).toHaveBeenCalledTimes(2))
  expect(vi.mocked(K.render).mock.calls.map(([source]) => source)).toEqual([
    'original',
    'original',
  ])
  await result.rerender({ value: '$late$' })
  result.unmount()
  await act()
  // Svelte 5 flushes rerenders synchronously, so the late value lands before
  // unmount; the preserved guarantee is that nothing renders after it.
  expect(K.render).toHaveBeenCalledTimes(3)
  expect(vi.mocked(K.render).mock.calls.map(([source]) => source)).toEqual([
    'original',
    'original',
    'late',
  ])
})

test('highlight waits for shared initialization before either Viewer renders', async () => {
  let finish!: () => void
  const init = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const plugins = [highlight({ init })]
  const a = render(Viewer, { value: '```js\nfirst\n```', plugins })
  const b = render(
    Viewer,
    { value: '```js\nsecond\n```', plugins },
    { container: document.body.appendChild(document.createElement('div')) },
  )
  await waitFor(() => expect(init).toHaveBeenCalledOnce())
  expect(H.highlightElement).not.toHaveBeenCalled()
  finish()
  await waitFor(() => expect(H.highlightElement).toHaveBeenCalledTimes(2))
  expect(a.container.querySelector('code')?.textContent).toBe('first\n')
  expect(b.container.querySelector('code')?.textContent).toBe('second\n')
})

test('highlight restores partial mutations after failure and processes later blocks', async () => {
  vi.mocked(H.highlightElement).mockImplementation((el) => {
    const source = el.textContent
    el.classList.add('hljs')
    el.dataset.highlighted = 'yes'
    el.innerHTML = '<span>partial</span>'
    if (source?.startsWith('bad')) throw new Error('highlight failed')
  })
  const result = render(Viewer, {
    value: '```js\nbad\n```\n\n```js\ngood\n```',
    plugins: [highlight()],
  })
  await waitFor(() => expect(H.highlightElement).toHaveBeenCalledTimes(2))
  const code = result.container.querySelector('code')!
  expect(code.textContent).toBe('bad\n')
  expect(code.className).toBe('language-js')
  expect(code.dataset.highlighted).toBeUndefined()
  expect(
    result.container.querySelector('[role="alert"]')?.textContent,
  ).toContain('highlight.js')
})

test('failed highlight initialization is reported and retried on the next render', async () => {
  const init = vi
    .fn()
    .mockRejectedValueOnce(new Error('init failed'))
    .mockResolvedValue(undefined)
  const plugins = [highlight({ init })]
  const result = render(Viewer, { value: '```js\nfirst\n```', plugins })
  await waitFor(() =>
    expect(result.container.querySelector('[role="alert"]')).not.toBeNull(),
  )
  expect(H.highlightElement).not.toHaveBeenCalled()
  await result.rerender({ value: '```js\nsecond\n```' })
  await waitFor(() => expect(H.highlightElement).toHaveBeenCalledOnce())
  expect(init).toHaveBeenCalledTimes(2)
  expect(result.container.querySelector('[role="alert"]')).toBeNull()
})

test('unmount while highlight initializes prevents late DOM work', async () => {
  let finish!: () => void
  const init = () =>
    new Promise<void>((resolve) => {
      finish = resolve
    })
  const result = render(Viewer, {
    value: '```js\nsource\n```',
    plugins: [highlight({ init })],
  })
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  result.unmount()
  finish()
  await act()
  expect(H.highlightElement).not.toHaveBeenCalled()
})

test.each(['math', 'highlight'])(
  '%s leaves a browser task opportunity between expensive blocks',
  async (kind) => {
    let time = 0
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    let count = 0
    let atBrowserTask = -1
    const work = (source: string, el: HTMLElement) => {
      count++
      if (count === 1) setTimeout(() => (atBrowserTask = count), 0)
      el.innerHTML = `<span>${source}</span>`
      time += 12 // Model a block that consumes a frame-sized amount of CPU.
    }
    vi.mocked(K.render).mockImplementation((source, el) => work(source, el))
    vi.mocked(H.highlightElement).mockImplementation((el) =>
      work(el.textContent ?? '', el),
    )
    render(Viewer, {
      value:
        kind === 'math'
          ? '$one$ and $two$ and $three$'
          : '```js\none\n```\n\n```js\ntwo\n```\n\n```js\nthree\n```',
      plugins: [kind === 'math' ? math() : highlight()],
    })
    await waitFor(() => expect(count).toBe(3))
    expect(atBrowserTask).toBe(1)
  },
)

test.each(['math', 'highlight'])(
  '%s stops a suspended old render when content changes',
  async (kind) => {
    let time = 0
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    const sources: string[] = []
    let result: ReturnType<typeof render>
    const work = (source: string, el: HTMLElement) => {
      sources.push(source.trim())
      if (sources.length === 1)
        setTimeout(() => {
          void result.rerender({
            value: kind === 'math' ? '$fresh$' : '```js\nfresh\n```',
          })
        }, 0)
      el.innerHTML = `<span>${source}</span>`
      time += 12
    }
    vi.mocked(K.render).mockImplementation((source, el) => work(source, el))
    vi.mocked(H.highlightElement).mockImplementation((el) =>
      work(el.textContent ?? '', el),
    )
    result = render(Viewer, {
      value:
        kind === 'math'
          ? '$one$ and $old$ and $stale$'
          : '```js\none\n```\n\n```js\nold\n```\n\n```js\nstale\n```',
      plugins: [kind === 'math' ? math() : highlight()],
    })
    await waitFor(() => expect(sources).toEqual(['one', 'fresh']))
    expect(
      result.container.querySelector('.markdown-body')?.textContent,
    ).toContain('fresh')
    expect(result.container.querySelector('[role="alert"]')).toBeNull()
  },
)

test('unmount cancels both suspended inline and display math jobs', async () => {
  let time = 0
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  let result: ReturnType<typeof render>
  let unmounted = false
  vi.mocked(K.render).mockImplementation((source, el) => {
    if (vi.mocked(K.render).mock.calls.length === 1)
      setTimeout(() => {
        result.unmount()
        unmounted = true
      }, 0)
    el.innerHTML = `<span>${source}</span>`
    time += 12
  })
  result = render(Viewer, {
    value: '$inline1$ and $inline2$\n\n$$\ndisplay1\n$$\n\n$$\ndisplay2\n$$',
    plugins: [math()],
  })
  await waitFor(() => expect(unmounted).toBe(true))
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(K.render).toHaveBeenCalledTimes(2)
  expect(result.container.querySelector('.markdown-body')).toBeNull()
})

test.each(['math', 'highlight'])(
  '%s discards resumed native scheduler work after unmount',
  async (kind) => {
    let time = 0
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    let resume!: () => void
    const yieldTask = vi.fn(
      () => new Promise<void>((resolve) => (resume = resolve)),
    )
    vi.stubGlobal('scheduler', { yield: yieldTask })
    let count = 0
    const work = (source: string, el: HTMLElement) => {
      count++
      el.innerHTML = `<span>${source}</span>`
      time += 12
    }
    vi.mocked(K.render).mockImplementation((source, el) => work(source, el))
    vi.mocked(H.highlightElement).mockImplementation((el) =>
      work(el.textContent ?? '', el),
    )
    const result = render(Viewer, {
      value:
        kind === 'math'
          ? '$one$ and $stale$'
          : '```js\none\n```\n\n```js\nstale\n```',
      plugins: [kind === 'math' ? math() : highlight()],
    })
    await waitFor(() => expect(yieldTask).toHaveBeenCalledOnce())
    result.unmount()
    resume()
    await act()
    expect(count).toBe(1)
    expect(result.container.querySelector('[role="alert"]')).toBeNull()
  },
)
