import { act, waitFor } from '@testing-library/svelte'

const cases = [
  {
    name: 'Mermaid',
    load: () => import('../../plugin-mermaid/src'),
    id: 'mermaid',
    html: '<pre><code class="language-mermaid">graph TD\nA-->B</code></pre>',
  },
  {
    name: 'KaTeX',
    load: () => import('../../plugin-math/src'),
    id: '../../plugin-math/node_modules/katex',
    html: '<p><code class="language-math">x</code></p>',
  },
  {
    name: 'highlight.js',
    load: () => import('../../plugin-highlight/src'),
    id: '../../plugin-highlight/node_modules/highlight.js',
    html: '<pre><code>source</code></pre>',
  },
]

beforeEach(() => vi.resetModules())
afterEach(() => {
  for (const { id } of cases) vi.doUnmock(id)
  document.body.innerHTML = ''
})

test.each(cases)(
  '$name module loading failure keeps source and reports the error',
  async ({ load, id, html }) => {
    vi.doMock(id, () => {
      throw new Error('module unavailable')
    })
    const plugin = (await load()).default()
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = html
    const original = root.textContent
    const reportError = vi.fn()
    const dispose = plugin.viewerEffect!({
      markdownBody: root,
      file: {} as any,
      reportError,
    })
    await waitFor(() => expect(reportError).toHaveBeenCalledOnce())
    expect(root.textContent).toBe(original)
    expect(root.querySelector('.bytemd-mermaid')).toBeNull()
    if (dispose) dispose()
  }
)

test.each(cases)(
  '$name ignores a module failure arriving after cleanup',
  async ({ load, id, html }) => {
    let reject!: (error: Error) => void
    vi.doMock(
      id,
      () =>
        new Promise((_, fail) => {
          reject = fail
        })
    )
    const plugin = (await load()).default()
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = html
    const reportError = vi.fn()
    const dispose = plugin.viewerEffect!({
      markdownBody: root,
      file: {} as any,
      reportError,
    })
    await waitFor(() => expect(reject).toBeTypeOf('function'))
    if (dispose) dispose()
    reject(new Error('late failure'))
    await act()
    expect(reportError).not.toHaveBeenCalled()
  }
)
