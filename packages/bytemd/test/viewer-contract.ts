import { renderMarkdown } from '../src/processor'
import type { RenderOptions, RenderResult } from '../src/render-types'
import type { ViewerProps } from '../src/types'
import type { BytemdViewerContext } from '../src/types'
import { waitFor } from '@testing-library/svelte'

interface MountedViewer {
  root: HTMLElement
  update(props: ViewerProps): Promise<void>
  destroy(): Promise<void>
}

export function testViewer(
  mount: (props: ViewerProps) => Promise<MountedViewer>
) {
  let viewer: MountedViewer | undefined
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    'clipboard'
  )

  afterEach(async () => {
    await viewer?.destroy()
    viewer = undefined
    vi.useRealTimers()
    vi.restoreAllMocks()
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    } else {
      delete (navigator as any).clipboard
    }
  })

  test('async rendering drops old results and keeps DOM plugin file metadata', async () => {
    const jobs: {
      input: RenderOptions
      resolve(result: RenderResult): void
    }[] = []
    const renderer = vi.fn(
      (input: RenderOptions) =>
        new Promise<RenderResult>((resolve) => jobs.push({ input, resolve }))
    )
    const effect = vi.fn()
    const plugins = [{ viewerEffect: effect }]
    let props: ViewerProps = { value: '# old', renderer, plugins }
    viewer = await mount(props)
    expect(viewer.root.querySelector('[role="status"]')).not.toBeNull()
    expect(viewer.root.querySelector('h1')).toBeNull()
    props = { ...props, value: '# fresh\n\n```js\nconst current = 1\n```' }
    await viewer.update(props)
    expect(jobs[0].input.signal?.aborted).toBe(true)
    const fresh = renderMarkdown(jobs[1].input)
    fresh.file.data.marker = 'transported'
    jobs[1].resolve(fresh)
    await viewer.update(props)
    await waitFor(() =>
      expect(viewer!.root.querySelector('.bytemd-copy-btn')).not.toBeNull()
    )
    expect(viewer.root.querySelector('h1')?.textContent).toBe('fresh')
    expect(viewer.root.querySelector('.bytemd-copy-btn')).not.toBeNull()
    expect(effect).toHaveBeenCalledOnce()
    expect(effect.mock.calls[0][0].file.data.marker).toBe('transported')
    jobs[0].resolve(renderMarkdown(jobs[0].input))
    await viewer.update(props)
    expect(viewer.root.querySelector('h1')?.textContent).toBe('fresh')
    expect(effect).toHaveBeenCalledOnce()
  })

  test('async failure clears effects and recovers when synchronous rendering is restored', async () => {
    const off = vi.fn()
    const plugins = [{ viewerEffect: () => off }]
    viewer = await mount({ value: '# ready', plugins })
    const error = new Error('Worker failed')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const renderer = vi.fn().mockRejectedValue(error)
    const props = {
      value: '# next',
      plugins,
      renderer,
      locale: {
        renderError: '渲染失败 <safe>',
        renderPending: '渲染中 <safe>',
      },
    }
    await viewer.update(props)
    await viewer.update(props)
    await waitFor(() =>
      expect(viewer!.root.querySelector('[role="alert"]')).not.toBeNull()
    )
    expect(off).toHaveBeenCalledOnce()
    expect(viewer.root.querySelector('h1')).toBeNull()
    expect(viewer.root.querySelector('[role="alert"]')?.textContent).toBe(
      '渲染失败 <safe>'
    )
    expect(viewer.root.querySelector('safe')).toBeNull()
    await viewer.update({ value: '# recovered', plugins, renderer: undefined })
    expect(viewer.root.querySelector('h1')?.textContent).toBe('recovered')
    expect(viewer.root.querySelector('[role="alert"]')).toBeNull()
  })

  test('unmount aborts async rendering and ignores late completion', async () => {
    let resolve!: (result: RenderResult) => void
    let input!: RenderOptions
    const renderer = vi.fn((options) => {
      input = options
      return new Promise<RenderResult>((r) => {
        resolve = r
      })
    })
    const effect = vi.fn()
    viewer = await mount({
      value: '# late',
      renderer,
      plugins: [{ viewerEffect: effect }],
    })
    await viewer.destroy()
    viewer = undefined
    expect(input.signal?.aborted).toBe(true)
    resolve(renderMarkdown(input))
    await Promise.resolve()
    await Promise.resolve()
    expect(effect).not.toHaveBeenCalled()
  })

  test('copies code without plugins and refreshes buttons when value changes', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    viewer = await mount({ value: '```ts\nconst a = 1\n```' })

    let buttons =
      viewer.root.querySelectorAll<HTMLButtonElement>('.bytemd-copy-btn')
    expect(buttons).toHaveLength(1)
    expect(viewer.root.querySelector('pre')?.dataset.codeLang).toBe('ts')
    buttons[0].click()
    await vi.advanceTimersByTimeAsync(0)
    expect(writeText).toHaveBeenLastCalledWith('const a = 1\n')
    expect(buttons[0].textContent).toBe('已复制')
    await vi.advanceTimersByTimeAsync(1200)
    expect(buttons[0].textContent).toBe('复制')

    await viewer.update({ value: '```js\nconst b = 2\n```\n\n```\nplain\n```' })
    buttons = viewer.root.querySelectorAll('.bytemd-copy-btn')
    expect(buttons).toHaveLength(2)
    expect(viewer.root.querySelector('pre')?.dataset.codeLang).toBe('js')
    buttons[1].click()
    await vi.advanceTimersByTimeAsync(0)
    expect(writeText).toHaveBeenLastCalledWith('plain\n')

    await viewer.update({ value: 'No code blocks' })
    expect(viewer.root.querySelectorAll('.bytemd-copy-btn')).toHaveLength(0)
  })

  test('passes the rendered file to plugins and cleans up on update and unmount', async () => {
    const off = vi.fn()
    const viewerEffect = vi.fn(({ markdownBody, file }) => {
      expect(markdownBody.querySelectorAll('.bytemd-copy-btn')).toHaveLength(1)
      expect(file.toString()).toContain('<pre>')
      return off
    })
    const plugins = [{ viewerEffect }]
    viewer = await mount({ value: '```\nfirst\n```', plugins })
    expect(viewerEffect).toHaveBeenCalledTimes(1)

    await viewer.update({ value: '```\nsecond\n```', plugins })
    expect(off).toHaveBeenCalledTimes(1)
    expect(viewerEffect).toHaveBeenCalledTimes(2)

    await viewer.destroy()
    viewer = undefined
    expect(off).toHaveBeenCalledTimes(2)
  })

  test('scrolls to heading anchors', async () => {
    viewer = await mount({ value: '# Title\n\n[Jump](#title)' })
    const heading = viewer.root.querySelector('h1')!
    heading.id = 'user-content-title'
    heading.scrollIntoView = vi.fn()
    viewer.root.querySelector('a')!.click()
    expect(heading.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  test('handles malformed and encoded fragments and clicks inside links', async () => {
    viewer = await mount({
      value: '# Title\n\n[**Jump**](#%74itle)\n\n<a href="#&quot;">broken</a>',
    })
    const heading = viewer.root.querySelector('h1')!
    heading.id = 'user-content-title'
    heading.scrollIntoView = vi.fn()
    viewer.root.querySelector('a strong')!.click()
    expect(heading.scrollIntoView).toHaveBeenCalledTimes(1)
    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => {
      event.preventDefault()
      errors.push(event.error)
    }
    window.addEventListener('error', onError)
    try {
      viewer.root.querySelectorAll('a')[1].click()
    } finally {
      window.removeEventListener('error', onError)
    }
    expect(errors).toEqual([])
  })

  test('clears failed renders and plugin effects, then recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const off = vi.fn()
    const viewerEffect = vi.fn(() => off)
    viewer = await mount({
      value: 'previous preview',
      plugins: [{ viewerEffect }],
    })
    const broken = {
      remark: (p: any) =>
        p.use(() => () => {
          throw new Error('audit render failure')
        }),
    }
    await viewer.update({
      value: 'new preview',
      plugins: [{ viewerEffect }, broken],
      locale: { renderError: '无法渲染 <unsafe>' },
    })
    expect(viewer.root.textContent).not.toContain('previous preview')
    expect(viewer.root.querySelector('[role="alert"]')?.textContent).toBe(
      '无法渲染 <unsafe>'
    )
    expect(viewer.root.querySelector('unsafe')).toBeNull()
    expect(off).toHaveBeenCalledTimes(1)
    expect(viewerEffect).toHaveBeenCalledTimes(1)
    await viewer.update({ value: 'recovered', plugins: [{ viewerEffect }] })
    expect(viewer.root.textContent).toContain('recovered')
    expect(viewer.root.querySelector('[role="alert"]')).toBeNull()
    expect(viewerEffect).toHaveBeenCalledTimes(2)
  })

  test('reports clipboard rejection without claiming success', async () => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    viewer = await mount({
      value: '```\nsample\n```',
      locale: { copy: 'Copy', copyFailed: 'Denied' },
    })
    const button =
      viewer.root.querySelector<HTMLButtonElement>('.bytemd-copy-btn')!
    expect(button.textContent).toBe('Copy')
    button.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(button.textContent).toBe('Denied')
    expect(viewer.root.querySelector('pre code')?.textContent).toBe('sample\n')
  })

  test('reports local plugin errors safely and ignores reports from old renders', async () => {
    const contexts: BytemdViewerContext[] = []
    const plugins = [
      {
        viewerEffect: (context: BytemdViewerContext) => {
          contexts.push(context)
        },
      },
    ]
    viewer = await mount({
      value: '```\nsource\n```',
      plugins,
      locale: { pluginError: '失败 <unsafe>' },
    })
    const events: CustomEvent[] = []
    viewer.root.addEventListener('bytemd-plugin-error', (event) =>
      events.push(event as CustomEvent)
    )
    const error = new Error('private diagnostic')
    const report = contexts[0].reportError!
    report(error, {
      plugin: 'Test',
      element: viewer.root.querySelector('code')!,
    })
    report(error, {
      plugin: 'Test',
      element: viewer.root.querySelector('code')!,
    })
    expect(viewer.root.querySelectorAll('.bytemd-plugin-error')).toHaveLength(1)
    expect(viewer.root.querySelector('[role="alert"]')?.textContent).toBe(
      'Test: 失败 <unsafe>'
    )
    expect(viewer.root.querySelector('unsafe')).toBeNull()
    expect(viewer.root.querySelector('pre code')?.textContent).toBe('source\n')
    expect(events).toHaveLength(2)
    expect(events[0].detail.error).toBe(error)
    expect(events[0].detail.file).toBe(contexts[0].file)
    await viewer.update({ value: 'new source', plugins })
    report(error)
    expect(viewer.root.querySelector('[role="alert"]')).toBeNull()
    expect(events).toHaveLength(2)
    contexts[contexts.length - 1].reportError!(error)
    expect(viewer.root.querySelector('[role="alert"]')).not.toBeNull()
    const last = contexts[contexts.length - 1].reportError!
    const root = viewer.root
    await viewer.destroy()
    viewer = undefined
    last(error)
    expect(root.querySelector('.bytemd-plugin-error')).toBeNull()
  })

  test('isolates synchronous effect and cleanup failures between plugins', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const off = vi.fn()
    const effect = vi.fn(() => off)
    viewer = await mount({
      value: 'content',
      plugins: [
        {
          viewerEffect: () => {
            throw new Error('effect failed')
          },
        },
        {
          viewerEffect: () => () => {
            throw new Error('cleanup failed')
          },
        },
        { viewerEffect: effect },
      ],
    })
    expect(effect).toHaveBeenCalledOnce()
    expect(viewer.root.textContent).toContain('content')
    expect(viewer.root.querySelector('.bytemd-plugin-error')).not.toBeNull()
    await viewer.destroy()
    viewer = undefined
    expect(off).toHaveBeenCalledOnce()
  })
}
