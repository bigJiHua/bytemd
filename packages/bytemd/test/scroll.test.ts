import { createCodeMirror } from '../src/editor'
import Editor from '../src/editor.svelte'
import { renderMarkdown } from '../src/processor'
import type { RenderOptions, RenderResult } from '../src/render-types'
import { measureScrollMap, mapScrollRatio } from '../src/scroll'
import type { SourceBlock } from '../src/scroll'
import Viewer from '../src/viewer.svelte'
import '@testing-library/jest-dom'
import { render, act, cleanup, waitFor } from '@testing-library/svelte'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function geometry(element: HTMLElement, top: () => number) {
  vi.spyOn(element, 'getClientRects').mockReturnValue([{}] as any)
  return vi
    .spyOn(element, 'getBoundingClientRect')
    .mockImplementation(() => ({ top: top() }) as DOMRect)
}

function previewGeometry(preview: HTMLElement) {
  Object.defineProperties(preview, {
    scrollHeight: { value: 1000, configurable: true },
    clientHeight: { value: 100, configurable: true },
  })
  geometry(preview, () => 100)
}

test('mapping retains source identity when plugins wrap and remove blocks', () => {
  const preview = document.createElement('div')
  preview.innerHTML =
    '<h1 data-bytemd-block="a">A</h1><div><h2 data-bytemd-block="c">C</h2></div>'
  previewGeometry(preview)
  const blocks: SourceBlock[] = [
    { id: 'a', line: 0, index: 0 },
    { id: 'b', line: 2, index: 1 },
    { id: 'c', line: 4, index: 2 },
  ]
  geometry(preview.querySelector('h1')!, () => 120)
  geometry(preview.querySelector('h2')!, () => 400)
  const map = measureScrollMap(preview, blocks, 900, (line) => line * 100)!
  expect(mapScrollRatio(400 / 900, map.edit, map.preview)).toBeCloseTo(
    300 / 900,
  )
  expect(map.tocBlocks).toContain(2)
})

test.each(['duplicate', 'reordered'])(
  '%s source identities disable mapping',
  (kind) => {
    const preview = document.createElement('div')
    preview.innerHTML =
      kind === 'duplicate'
        ? '<p data-bytemd-block="a"></p><p data-bytemd-block="a"></p>'
        : '<p data-bytemd-block="b"></p><p data-bytemd-block="a"></p>'
    previewGeometry(preview)
    for (const node of preview.querySelectorAll<HTMLElement>('p'))
      geometry(node, () => 200)
    expect(
      measureScrollMap(
        preview,
        [
          { id: 'a', line: 0, index: 0 },
          { id: 'b', line: 2, index: 1 },
        ],
        900,
        (line) => line * 100,
      ),
    ).toBeUndefined()
  },
)

test.each([0, -1, Infinity, NaN])(
  'invalid editor range %s disables mapping',
  (height) => {
    const preview = document.createElement('div')
    previewGeometry(preview)
    expect(measureScrollMap(preview, [], height, () => 0)).toBeUndefined()
  },
)

test('interpolation clamps overscroll and rejects nonfinite values', () => {
  const from = [0, 0.5, 1]
  const to = [0, 0.25, 1]
  expect(mapScrollRatio(-0.1, from, to)).toBe(0)
  expect(mapScrollRatio(1.1, from, to)).toBe(1)
  expect(mapScrollRatio(0.75, from, to)).toBe(0.625)
  expect(mapScrollRatio(NaN, from, to)).toBeUndefined()
})

const source = '# A\n\nremoved\n\n## B\n\nend'

async function mountMappedEditor(plugins: any[] = []) {
  const result = render(Editor, { value: source, mode: 'split', plugins })
  await act()
  const editor = (result.container.querySelector('.CodeMirror') as any)
    .CodeMirror
  const preview =
    result.container.querySelector<HTMLElement>('.bytemd-preview')!
  previewGeometry(preview)
  let editTop = 400
  vi.spyOn(editor, 'getScrollInfo').mockImplementation(() => ({
    top: editTop,
    height: 1000,
    clientHeight: 100,
    clientWidth: 500,
  }))
  vi.spyOn(editor, 'heightAtLine').mockImplementation(
    (line: number) => line * 100,
  )
  const previewScroll = vi.fn()
  preview.scrollTo = previewScroll
  const editScroll = vi.spyOn(editor, 'scrollTo').mockImplementation(() => {})
  const nodes = preview.querySelectorAll<HTMLElement>('[data-bytemd-block]')
  const rects = [...nodes].map((node, index) =>
    geometry(node, () => 120 + index * 100 - preview.scrollTop),
  )
  await act()
  return {
    result,
    editor,
    preview,
    previewScroll,
    editScroll,
    rects,
    setEditTop: (top: number) => (editTop = top),
    scrollEditor: () => createCodeMirror().signal(editor, 'scroll', editor),
  }
}

test('editor synchronization works with a removed block and nested wrapper', async () => {
  const mounted = await mountMappedEditor([
    {
      viewerEffect: ({ markdownBody }: any) => {
        markdownBody.querySelector('p')?.remove()
        const heading = markdownBody.querySelector('h2')!
        const wrapper = document.createElement('section')
        heading.replaceWith(wrapper)
        wrapper.appendChild(heading)
      },
    },
  ])
  mounted.scrollEditor()
  expect(mounted.previewScroll).toHaveBeenCalledWith(0, 120)
})

test('unchanged scrolling reuses geometry, DOM mutations invalidate immediately', async () => {
  const mounted = await mountMappedEditor()
  mounted.scrollEditor()
  const measured = mounted.rects[2].mock.calls.length
  mounted.setEditTop(450)
  mounted.scrollEditor()
  expect(mounted.rects[2]).toHaveBeenCalledTimes(measured)
  const heading = mounted.preview.querySelector<HTMLElement>('h2')!
  const top = 420
  mounted.rects[2].mockImplementation(() => ({ top }) as DOMRect)
  heading.style.marginTop = '200px'
  await act()
  mounted.setEditTop(400)
  mounted.scrollEditor()
  expect(mounted.rects[2].mock.calls.length).toBeGreaterThan(measured)
  expect(mounted.previewScroll).toHaveBeenLastCalledWith(0, 320)
})

test.each(['load', 'toggle'])(
  '%s events invalidate cached layout',
  async (event) => {
    const mounted = await mountMappedEditor()
    mounted.scrollEditor()
    const measured = mounted.rects[2].mock.calls.length
    mounted.rects[2].mockImplementation(() => ({ top: 420 }) as DOMRect)
    mounted.preview.querySelector('h2')!.dispatchEvent(new Event(event))
    mounted.scrollEditor()
    expect(mounted.rects[2].mock.calls.length).toBeGreaterThan(measured)
    expect(mounted.previewScroll).toHaveBeenLastCalledWith(0, 320)
  },
)

test('scrolling skips an obsolete preview while controlled input is debounced', async () => {
  vi.useFakeTimers()
  const mounted = await mountMappedEditor()
  mounted.scrollEditor()
  mounted.previewScroll.mockClear()
  await mounted.result.rerender({ value: '# changed\n\nnew content' })
  await act()
  mounted.scrollEditor()
  expect(mounted.previewScroll).not.toHaveBeenCalled()
})

test('changing scroll dimensions invalidates geometry without waiting for observers', async () => {
  const mounted = await mountMappedEditor()
  mounted.scrollEditor()
  const measured = mounted.rects[2].mock.calls.length
  Object.defineProperty(mounted.preview, 'scrollHeight', { value: 1300 })
  mounted.scrollEditor()
  expect(mounted.rects[2].mock.calls.length).toBeGreaterThan(measured)
})

test('font loading invalidates layout and unsubscribes on unmount', async () => {
  const previous = Object.getOwnPropertyDescriptor(document, 'fonts')
  const fonts = new EventTarget()
  const removed = vi.spyOn(fonts, 'removeEventListener')
  Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
  try {
    const mounted = await mountMappedEditor()
    mounted.scrollEditor()
    const measured = mounted.rects[2].mock.calls.length
    fonts.dispatchEvent(new Event('loadingdone'))
    mounted.scrollEditor()
    expect(mounted.rects[2].mock.calls.length).toBeGreaterThan(measured)
    mounted.result.unmount()
    expect(removed.mock.calls.some(([type]) => type === 'loadingdone')).toBe(
      true,
    )
  } finally {
    if (previous) Object.defineProperty(document, 'fonts', previous)
    else delete (document as any).fonts
  }
})

test('manual preview scrolling is not swallowed by a missing programmatic scroll event', async () => {
  const mounted = await mountMappedEditor()
  mounted.scrollEditor()
  mounted.preview.scrollTop = 300
  mounted.preview.dispatchEvent(new Event('scroll'))
  expect(mounted.editScroll).toHaveBeenCalled()
})

test('layout invalidation preserves pending scroll feedback suppression', async () => {
  const mounted = await mountMappedEditor()
  mounted.setEditTop(0)
  mounted.preview.scrollTop = 220
  mounted.preview.dispatchEvent(new Event('scroll'))
  const target = mounted.editScroll.mock.calls[0][1]
  mounted.setEditTop(target)
  // CodeMirror can refine offscreen line heights during a programmatic jump.
  // A layout notification must not turn the resulting scroll into a return jump.
  mounted.rects[2].mockImplementation(() => ({ top: 420 }) as DOMRect)
  mounted.preview.dispatchEvent(new Event('load'))
  mounted.scrollEditor()
  expect(mounted.previewScroll).not.toHaveBeenCalled()
  mounted.setEditTop(target + 100)
  mounted.scrollEditor()
  expect(mounted.previewScroll).toHaveBeenCalled()
})

test('table of contents targets source blocks rather than nested DOM heading order', async () => {
  const mounted = await mountMappedEditor([
    {
      viewerEffect: ({ markdownBody }: any) => {
        const extra = document.createElement('h3')
        extra.textContent = 'plugin heading'
        markdownBody.querySelector('p')!.appendChild(extra)
      },
    },
  ])
  const target = mounted.preview.querySelector('h2')!
  const jump = vi.fn()
  target.scrollIntoView = jump
  const buttons =
    mounted.result.container.querySelectorAll<HTMLButtonElement>(
      '.bytemd-toc-button',
    )
  expect([...buttons].map((button) => button.textContent)).toEqual(['A', 'B'])
  buttons[1].click()
  expect(jump).toHaveBeenCalledOnce()
  mounted.preview.scrollTop = 230
  mounted.preview.dispatchEvent(new Event('scroll'))
  await act()
  expect(buttons[1].getAttribute('aria-current')).toBe('location')
})

test('render failure clears the previous table of contents', async () => {
  vi.useFakeTimers()
  const mounted = await mountMappedEditor()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await mounted.result.rerender({
    value: 'failed',
    previewDebounce: 0,
    plugins: [
      {
        rehype: (processor: any) =>
          processor.use(() => () => {
            throw new Error('render failed')
          }),
      },
    ],
  })
  await act()
  await vi.advanceTimersByTimeAsync(1)
  await act()
  expect(
    mounted.result.container.querySelector('.bytemd-toc-button'),
  ).toBeNull()
})

test('table of contents honors scroll margin when the heading stays below the viewport top', async () => {
  const mounted = await mountMappedEditor()
  mounted.preview.querySelector<HTMLElement>('h2')!.style.scrollMarginTop =
    '34px'
  await act()
  mounted.preview.scrollTop = 186
  mounted.preview.dispatchEvent(new Event('scroll'))
  await act()
  expect(
    mounted.result.container.querySelector(
      '.bytemd-toc [aria-current="location"]',
    )?.textContent,
  ).toBe('B')
})

test('table of contents resets indentation when the document heading levels change', async () => {
  vi.useFakeTimers()
  const result = render(Editor, { value: '# initial', previewDebounce: 0 })
  await act()
  await result.rerender({ value: '#### replacement' })
  await act()
  await vi.advanceTimersByTimeAsync(1)
  await act()
  const item = result.container.querySelector<HTMLElement>('.bytemd-toc li')!
  expect(item.classList.contains('bytemd-toc-first')).toBe(true)
  expect(item.style.paddingLeft).toBe('8px')
})

test('returning to the rendered source resumes synchronization before debounce fires', async () => {
  vi.useFakeTimers()
  const mounted = await mountMappedEditor()
  await mounted.result.rerender({ value: 'pending' })
  await act()
  await mounted.result.rerender({ value: source })
  await act()
  mounted.scrollEditor()
  expect(mounted.previewScroll).toHaveBeenCalled()
})

test('editor layout observers and subscriptions are released on unmount', async () => {
  const resize = vi.spyOn(ResizeObserver.prototype, 'disconnect')
  const mutations = vi.spyOn(MutationObserver.prototype, 'disconnect')
  const mounted = await mountMappedEditor()
  const removed = vi.spyOn(mounted.preview, 'removeEventListener')
  mounted.result.unmount()
  expect(resize.mock.calls.length).toBeGreaterThanOrEqual(2)
  expect(mutations).toHaveBeenCalled()
  for (const event of ['load', 'error', 'toggle', 'scroll'])
    expect(removed.mock.calls.some(([type]) => type === event)).toBe(true)
})

test('standalone Viewer does not add Editor source metadata', async () => {
  const result = render(Viewer, { value: source })
  await act()
  expect(result.container.querySelector('[data-bytemd-block]')).toBeNull()
})

test('async Editor preserves source blocks and clears stale table of contents while pending', async () => {
  const requests: {
    options: RenderOptions
    resolve(result: RenderResult): void
  }[] = []
  const renderer = (options: RenderOptions) =>
    new Promise<RenderResult>((resolve) => {
      requests.push({ options, resolve })
    })
  const result = render(Editor, {
    value: '# First',
    renderer,
    previewDebounce: 0,
  })
  await waitFor(() => expect(requests).toHaveLength(1))
  expect(requests[0].options.sourceMap).toBe(true)
  requests[0].resolve(renderMarkdown(requests[0].options))
  await waitFor(() =>
    expect(
      result.container.querySelector('.bytemd-toc-button')?.textContent,
    ).toBe('First'),
  )
  expect(result.container.querySelector('h1')).toHaveAttribute(
    'data-bytemd-block',
  )
  await result.rerender({ value: '# Superseded' })
  await waitFor(() => expect(requests).toHaveLength(2))
  expect(result.container.querySelector('.bytemd-toc-button')).toBeNull()
  await result.rerender({ value: '## Latest' })
  await waitFor(() => expect(requests).toHaveLength(3))
  expect(requests[1].options.signal?.aborted).toBe(true)
  requests[1].resolve(renderMarkdown(requests[1].options))
  await act()
  expect(result.container.querySelector('.bytemd-toc-button')).toBeNull()
  requests[2].resolve(renderMarkdown(requests[2].options))
  await waitFor(() =>
    expect(
      result.container.querySelector('.bytemd-toc-button')?.textContent,
    ).toBe('Latest'),
  )
  expect(result.container.querySelector('h2')).toHaveAttribute(
    'data-bytemd-block',
  )
})
