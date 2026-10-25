import type { ViewerProps } from '../src/types'

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
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    } else {
      delete (navigator as any).clipboard
    }
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
}
