/// <reference types="vitest/globals" />
import Viewer from '../src/viewer.svelte'
import '@testing-library/jest-dom'
import { render } from '@testing-library/svelte'

function markdownBody($: ReturnType<typeof render>) {
  return $.container.querySelector('.markdown-body') as HTMLElement
}

test('wraps an inline range and applies the font size after sanitize', () => {
  const $ = render(Viewer, { value: '[size=24]这里的字体将变大[/size]' })
  const span = $.container.querySelector('span.bytemd-size-24')

  expect(span).toBeInTheDocument()
  expect(span?.getAttribute('style')).toContain('font-size:24px')
  expect(span?.textContent).toBe('这里的字体将变大')
  expect(markdownBody($).textContent).not.toContain('[size=24]')
  expect(markdownBody($).textContent).not.toContain('[/size]')

  $.unmount()
})

test('keeps inline nodes inside the range', () => {
  const $ = render(Viewer, { value: '[size=20]**加粗**与`code`[/size]' })
  const span = $.container.querySelector('span.bytemd-size-20')

  expect(span?.querySelector('strong')?.textContent).toBe('加粗')
  expect(span?.querySelector('code')?.textContent).toBe('code')
  expect(span?.getAttribute('style')).toContain('font-size:20px')

  $.unmount()
})

test('supports nesting and px units', () => {
  const $ = render(Viewer, { value: '[size=20]A[size=30px]B[/size]C[/size]' })
  const outer = $.container.querySelector('span.bytemd-size-20')
  const inner = outer?.querySelector('span.bytemd-size-30')

  expect(outer?.textContent).toBe('ABC')
  expect(inner?.textContent).toBe('B')
  expect(inner?.getAttribute('style')).toContain('font-size:30px')

  $.unmount()
})

test('ignores out-of-range sizes, unclosed tags and code blocks', () => {
  const $ = render(Viewer, {
    value:
      '[size=200]太大[/size]\n\n[size=20]未闭合\n\n```\n[size=24]代码[/size]\n```',
  })
  const body = markdownBody($)

  expect($.container.querySelector('[class*="bytemd-size-"]')).toBeNull()
  expect(body.textContent).toContain('[size=200]')
  expect(body.textContent).toContain('[size=20]')
  expect(body.querySelector('pre code')?.textContent).toContain('[size=24]')

  $.unmount()
})
