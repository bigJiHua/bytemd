import { Viewer } from '../src'
import { renderMarkdown } from '../src/processor'
import '@testing-library/jest-dom'
import { act, render } from '@testing-library/svelte'

function html(
  value: string,
  options: Parameters<typeof renderMarkdown>[0] = { value }
) {
  return renderMarkdown(options).file.toString()
}

test('adds GitHub-style heading ids by default', () => {
  const output = html('# 一、背景与目标\n\n## Hello, World!')
  expect(output).toContain('id="一背景与目标"')
  expect(output).toContain('id="hello-world"')
})

test('deduplicates repeated headings and preserves existing ids', () => {
  const output = html('# 重复\n\n# 重复\n\n<h2 id="custom">已存在</h2>')
  expect(output).toContain('id="重复"')
  expect(output).toContain('id="重复-1"')
  // Raw HTML ids pass through clobber protection from the sanitizer.
  expect(output).toContain('id="user-content-custom"')
})

test('can be disabled or prefixed', () => {
  expect(html('# 标题', { value: '# 标题', headingIds: false })).not.toContain(
    'id="标题"'
  )
  expect(
    html('# 标题', {
      value: '# 标题',
      headingIds: { prefix: 'user-content-' },
    })
  ).toContain('id="user-content-标题"')
})

test('skips headings without text', () => {
  const output = html('# !!!')
  expect(output).not.toContain('<h1 id=')
})

test('in-page anchors resolve to generated heading ids', async () => {
  const result = render(Viewer, {
    value: '# 一、背景与目标\n\n[跳转](#一背景与目标)',
  })
  await act()
  const heading = result.container.querySelector('h1') as HTMLElement
  expect(heading.id).toBe('一背景与目标')
  const scrollIntoView = vi.fn()
  heading.scrollIntoView = scrollIntoView
  result.container.querySelector('a')!.click()
  expect(scrollIntoView).toHaveBeenCalledTimes(1)
})
