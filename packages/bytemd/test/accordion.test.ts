/// <reference types="vitest/globals" />
import Viewer from '../src/viewer.svelte'
import '@testing-library/jest-dom'
import { render } from '@testing-library/svelte'

const sample = `+++ 点击展开更多
内容0
++- 默认展开
内容1
++ 默认收起
内容2
+++`

test('accordion with contiguous lines', () => {
  const $ = render(Viewer, { value: sample })
  const items = [
    ...$.container.querySelectorAll<HTMLDetailsElement>(
      'details.bytemd-accordion-item',
    ),
  ]

  expect($.container.querySelectorAll('.bytemd-accordion').length).toBe(1)
  expect(items.length).toBe(3)
  expect(items.map((el) => el.querySelector('summary')?.textContent)).toEqual([
    '点击展开更多',
    '默认展开',
    '默认收起',
  ])
  expect(items[0]).not.toHaveAttribute('open')
  expect(items[1]).toHaveAttribute('open')
  expect(items[2]).not.toHaveAttribute('open')
  expect(
    items.map((el) => el.querySelector('.bytemd-accordion-body')?.textContent),
  ).toEqual(['内容0', '内容1', '内容2'])

  $.unmount()
})

test('accordion with blank lines between blocks', () => {
  const $ = render(Viewer, {
    value: `+++ 收起\n\n内容A\n\n++- 展开\n\n内容B\n\n+++`,
  })
  const items = $.container.querySelectorAll('.bytemd-accordion-item')

  expect(items.length).toBe(2)
  expect(items[0]).not.toHaveAttribute('open')
  expect(items[1]).toHaveAttribute('open')
  expect(items[0].querySelector('.bytemd-accordion-body')?.textContent).toBe(
    '内容A',
  )
  expect(items[1].querySelector('.bytemd-accordion-body')?.textContent).toBe(
    '内容B',
  )

  $.unmount()
})

test('unclosed accordion stays plain text', () => {
  const $ = render(Viewer, { value: '+++ 标题\n内容\n++' })

  expect($.container.querySelector('.bytemd-accordion')).toBeNull()
  expect($.container.textContent).toContain('+++ 标题')

  $.unmount()
})
