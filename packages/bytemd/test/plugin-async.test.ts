import mermaid from '../../plugin-mermaid/src'
import Viewer from '../src/viewer.svelte'
import { render, act, cleanup, waitFor } from '@testing-library/svelte'
import Mermaid from 'mermaid'

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

test('Mermaid restores replaced nodes on content updates and ignores late renders', async () => {
  let finish!: (result: { svg: string }) => void
  vi.mocked(Mermaid.render).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const plugins = [mermaid()]
  const result = render(Viewer, {
    value: '```mermaid\ngraph TD\nA-->B\n```',
    plugins,
  })
  await act()
  await waitFor(() =>
    expect(result.container.querySelector('.bytemd-mermaid')).not.toBeNull(),
  )
  expect(result.container.querySelector('pre code')?.textContent).toContain(
    'A-->B',
  )
  await result.rerender({ value: 'new content', plugins })
  await act()
  expect(result.container.querySelector('.bytemd-mermaid')).toBeNull()
  finish({ svg: '<svg><text>old diagram</text></svg>' })
  await act()
  expect(result.container.textContent).toBe('new content')
  expect(result.container.querySelector('svg')).toBeNull()
})

test('Mermaid serializes configuration with each render across Viewers', async () => {
  const finishes: (() => void)[] = []
  let theme: string | undefined
  const seen: (string | undefined)[] = []
  vi.mocked(Mermaid.initialize).mockImplementation((config) => {
    theme = config?.theme
  })
  vi.mocked(Mermaid.render).mockImplementation(
    (id) =>
      new Promise((resolve) => {
        seen.push(theme)
        finishes.push(() => {
          seen.push(theme)
          resolve({ svg: `<svg id="${id}"></svg>` } as any)
        })
      }),
  )
  const value = '```mermaid\ngraph TD\nA-->B\n```'
  const a = render(
    Viewer,
    { value, plugins: [mermaid({ theme: 'dark' })] },
    { container: document.body.appendChild(document.createElement('div')) },
  )
  const b = render(
    Viewer,
    { value, plugins: [mermaid({ theme: 'forest' })] },
    { container: document.body.appendChild(document.createElement('div')) },
  )
  await waitFor(() => expect(finishes).toHaveLength(1))
  expect(Mermaid.initialize).toHaveBeenCalledTimes(1)
  finishes[0]()
  await waitFor(() => expect(finishes).toHaveLength(2))
  finishes[1]()
  await waitFor(() => expect(b.container.querySelector('svg')).not.toBeNull())
  expect(seen).toEqual(['dark', 'dark', 'forest', 'forest'])
  expect(a.container.querySelector('svg')?.id).not.toBe(
    b.container.querySelector('svg')?.id,
  )
  await a.rerender({ value: value.replace('A-->B', 'A-->C') })
  await waitFor(() => expect(finishes).toHaveLength(3))
  finishes[2]()
  await waitFor(() => expect(a.container.querySelector('svg')).not.toBeNull())
  expect(seen.slice(-2)).toEqual(['dark', 'dark'])
})

test('a failed Mermaid diagram keeps source and does not block the next diagram', async () => {
  vi.mocked(Mermaid.render)
    .mockRejectedValueOnce(new Error('invalid diagram'))
    .mockResolvedValueOnce({
      svg: '<svg><text>valid diagram</text></svg>',
    } as any)
  const result = render(Viewer, {
    value: '```mermaid\nbad diagram\n```\n\n```mermaid\ngraph TD\nA-->B\n```',
    plugins: [mermaid()],
    locale: { pluginError: '无法渲染' },
  })
  await waitFor(() =>
    expect(result.container.querySelector('svg')?.textContent).toBe(
      'valid diagram',
    ),
  )
  expect(result.container.querySelector('pre code')?.textContent).toBe(
    'bad diagram\n',
  )
  expect(result.container.querySelector('[role="alert"]')?.textContent).toBe(
    'Mermaid: 无法渲染',
  )
  await result.rerender({ value: 'recovered' })
  await act()
  expect(result.container.querySelector('[role="alert"]')).toBeNull()
})

test('Mermaid skips queued stale jobs and removes in-flight staging on unmount', async () => {
  let finish!: (result: any) => void
  vi.mocked(Mermaid.render).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const value = '```mermaid\ngraph TD\nA-->B\n```'
  const a = render(Viewer, { value, plugins: [mermaid()] })
  await waitFor(() => expect(Mermaid.render).toHaveBeenCalledOnce())
  const b = render(Viewer, { value, plugins: [mermaid({ theme: 'dark' })] })
  await act()
  b.unmount()
  a.unmount()
  expect(document.querySelector('.bytemd-mermaid')).toBeNull()
  finish({ svg: '<svg></svg>' })
  await act()
  expect(Mermaid.render).toHaveBeenCalledOnce()
  expect(Mermaid.initialize).toHaveBeenCalledOnce()
})

test('Mermaid binds interactions and restores source if binding fails', async () => {
  const bind = vi.fn(() => {
    throw new Error('binding failed')
  })
  vi.mocked(Mermaid.render).mockResolvedValue({
    svg: '<svg></svg>',
    bindFunctions: bind,
  } as any)
  const result = render(Viewer, {
    value: '```mermaid\ngraph TD\nA-->B\n```',
    plugins: [mermaid()],
  })
  await waitFor(() =>
    expect(result.container.querySelector('[role="alert"]')).not.toBeNull(),
  )
  expect(bind).toHaveBeenCalledOnce()
  expect(result.container.querySelector('pre code')?.textContent).toContain(
    'A-->B',
  )
  expect(result.container.querySelector('svg')).toBeNull()
})

test('Mermaid retains a successful diagram and removes it on unmount', async () => {
  vi.mocked(Mermaid.render).mockResolvedValue({
    svg: '<svg><text>diagram</text></svg>',
    bindFunctions: undefined,
  } as any)
  const result = render(Viewer, {
    value: '```mermaid\ngraph TD\nA-->B\n```',
    plugins: [mermaid()],
  })
  await act()
  await waitFor(() =>
    expect(result.container.querySelector('svg')?.textContent).toBe('diagram'),
  )
  result.unmount()
  expect(result.container.querySelector('.bytemd-mermaid')).toBeNull()
})

test('Mermaid replacements preserve Editor source block metadata', async () => {
  vi.mocked(Mermaid.render).mockResolvedValue({
    svg: '<svg><text>diagram</text></svg>',
    bindFunctions: undefined,
  } as any)
  const result = render(Viewer, {
    value: '```mermaid\ngraph TD\nA-->B\n```',
    plugins: [mermaid()],
    sourceMap: true,
  })
  await act()
  await waitFor(() =>
    expect(result.container.querySelector('svg')).not.toBeNull(),
  )
  expect(
    result.container
      .querySelector('.bytemd-mermaid')
      ?.getAttribute('data-bytemd-block'),
  ).toMatch(/^\d+-0$/)
})

test('pending Mermaid staging does not duplicate Editor source identity', async () => {
  let finish!: (result: any) => void
  vi.mocked(Mermaid.render).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const result = render(Viewer, {
    value: '```mermaid\ngraph TD\nA-->B\n```',
    plugins: [mermaid()],
    sourceMap: true,
  })
  await waitFor(() => expect(Mermaid.render).toHaveBeenCalledOnce())
  expect(result.container.querySelectorAll('[data-bytemd-block]')).toHaveLength(
    1,
  )
  expect(result.container.querySelector('[data-bytemd-block]')?.tagName).toBe(
    'PRE',
  )
  finish({ svg: '<svg></svg>' })
  await waitFor(() => expect(result.container.querySelector('pre')).toBeNull())
  expect(result.container.querySelectorAll('[data-bytemd-block]')).toHaveLength(
    1,
  )
})
