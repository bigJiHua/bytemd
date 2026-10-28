/// <reference types="vitest/globals" />
import { addCopyButtons, copyCodeFromButton } from '../src/utils'
import Viewer from '../src/viewer.svelte'
import { testViewer } from './viewer-contract'
import '@testing-library/jest-dom'
import { render, act } from '@testing-library/svelte'

describe('Svelte Viewer contract', () => {
  testViewer(async (props) => {
    const result = render(Viewer, props)
    await act()
    return {
      root: result.container,
      async update(nextProps) {
        await result.rerender(nextProps)
        await act()
      },
      async destroy() {
        result.unmount()
      },
    }
  })
})

function stripComment(str: string) {
  return str.replace(/<\!--.*?-->/g, '')
}

test('value', async () => {
  const $ = render(Viewer, { value: '# title' })
  expect(
    stripComment($.container.querySelector('.markdown-body')?.innerHTML),
  ).toEqual('<h1 id="title">title</h1>')
  $.unmount()
})

test('[warning] callout', async () => {
  const $ = render(Viewer, { value: '>[warning] 危险操作\n正文' })
  const bq = $.container.querySelector('blockquote.bytemd-callout-warning')
  expect(bq).toBeInTheDocument()
  expect(stripComment(bq?.innerHTML ?? '')).not.toContain('[warning]')
  expect(stripComment(bq?.innerHTML ?? '')).toContain('危险操作')
  $.unmount()
})

test.each([
  ['>[default] 提示', 'bytemd-callout-default'],
  ['>[success] 成功', 'bytemd-callout-success'],
  ['>[info] 信息', 'bytemd-callout-info'],
  ['>[danger] 重要', 'bytemd-callout-danger'],
  ['>[error] 同 danger', 'bytemd-callout-danger'],
  ['>[成功] 中文别名', 'bytemd-callout-success'],
  ['>[重要] 中文别名', 'bytemd-callout-danger'],
])('%s -> %s', (value, cls) => {
  const $ = render(Viewer, { value })
  expect($.container.querySelector(`blockquote.${cls}`)).toBeInTheDocument()
  $.unmount()
})

test('unknown marker keeps plain blockquote', async () => {
  const $ = render(Viewer, { value: '>[foo] 未知状态' })
  const bq = $.container.querySelector('blockquote')
  expect(bq).toBeInTheDocument()
  expect(bq?.classList.contains('bytemd-callout')).toBe(false)
  expect(stripComment(bq?.innerHTML ?? '')).toContain('[foo]')
  $.unmount()
})

test('marker absent keeps plain blockquote', async () => {
  const $ = render(Viewer, { value: '> 普通引用' })
  const bq = $.container.querySelector('blockquote')
  expect(bq).toBeInTheDocument()
  expect(bq?.classList.contains('bytemd-callout')).toBe(false)
  $.unmount()
})

test('code block copy button helpers', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })

  document.body.innerHTML = `<div id="fixture"><pre><code class="language-ts">const a = 1</code></pre><pre><code>body { color: red; }</code></pre></div>`
  const fixture = document.querySelector('#fixture') as HTMLElement

  addCopyButtons(fixture)
  addCopyButtons(fixture) // idempotent

  const pres = fixture.querySelectorAll('pre')
  expect(pres[0].classList.contains('bytemd-code-block')).toBe(true)
  expect(pres[0].getAttribute('data-code-lang')).toBe('ts')
  expect(pres[1].getAttribute('data-code-lang')).toBe(null)

  const btns = fixture.querySelectorAll('pre .bytemd-copy-btn')
  expect(btns.length).toBe(2)
  expect((btns[0] as HTMLButtonElement).textContent).toBe('复制')

  copyCodeFromButton(btns[0] as HTMLButtonElement)
  await new Promise((r) => setTimeout(r, 0))
  expect(writeText).toHaveBeenCalledWith('const a = 1')
  expect((btns[0] as HTMLButtonElement).textContent).toBe('已复制')

  document.body.removeChild(fixture)
})

test('plugin', async () => {
  const $ = render(Viewer, {})
  await act()
  const off = vi.fn()
  const viewerEffect = vi.fn(({ markdownBody }: any) => {
    const enhancement = document.createElement('div')
    enhancement.className = 'viewer-enhancement'
    markdownBody.append(enhancement)
    return off
  })
  // Keep the array identity stable across rerenders: the Svelte 5 bridge
  // re-runs on new prop objects, and the applied signature must stay the
  // source of truth for whether effects rebind.
  const plugins = [{ viewerEffect }]

  await $.rerender({ plugins })
  await act()
  expect(viewerEffect).toBeCalled()
  expect(viewerEffect).toBeCalledTimes(1)

  // FIXME:
  // expect(viewerEffect).toBeCalledWith<any>(
  //   expect.objectContaining({
  //     markdownBody: $.container.querySelector('.markdown-body'),
  //     file: expect.objectContaining({
  //       contents: '',
  //       data: {},
  //     }),
  //   })
  // )

  // Identical render inputs must not tear the bound effect down: cleanup and
  // rebinding stay paired, so the enhancement survives a redundant update.
  await $.rerender({ plugins })
  await act()
  expect(viewerEffect).toBeCalledTimes(1)
  expect(off).not.toBeCalled()
  expect($.container.querySelector('.viewer-enhancement')).not.toBeNull()

  const nextOff = vi.fn()
  const nextEffect = vi.fn(() => nextOff)
  await $.rerender({
    value: '# changed',
    plugins: [{ viewerEffect: nextEffect }],
  })
  await act()
  expect(off).toBeCalledTimes(1)
  expect(nextEffect).toBeCalledTimes(1)
})

test('in-place plugin additions still re-render the preview', async () => {
  const plugins: any[] = []
  const $ = render(Viewer, { value: '# title', plugins })
  await act()
  expect($.container.querySelector('.mutated-marker')).toBeNull()

  plugins.push({
    rehype: (processor: any) =>
      processor.use(() => (tree: any) => {
        tree.children.push({
          type: 'element',
          tagName: 'div',
          properties: { className: ['mutated-marker'] },
          children: [],
        })
      }),
  })
  await $.rerender({ plugins })
  await act()
  expect($.container.querySelector('.mutated-marker')).not.toBeNull()
})
