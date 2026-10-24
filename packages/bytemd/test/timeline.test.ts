/// <reference types="vitest/globals" />
import Viewer from '../src/viewer.svelte'
import '@testing-library/jest-dom'
import { render } from '@testing-library/svelte'

const sample = `::: timeline 时间线
:: [done] 2024-01-15 项目立项
   完成需求评审
:: [doing] 2024-03-20 Alpha 版本
   正在联调
:: [todo] 2024-06-01 正式上线
:: [error] 2024-07-01 严重回滚事件
:: [milestone] 2024-08-01 用户破万
:::`

test('timeline renders title, items, dates and descriptions', () => {
  const $ = render(Viewer, { value: sample })
  const items = [
    ...$.container.querySelectorAll<HTMLElement>('.bytemd-timeline-item'),
  ]

  expect($.container.querySelectorAll('.bytemd-timeline').length).toBe(1)
  expect($.container.querySelector('.bytemd-timeline-title')?.textContent).toBe(
    '时间线'
  )
  expect(items.length).toBe(5)
  expect(
    items.map((el) => el.querySelector('.bytemd-timeline-date')?.textContent)
  ).toEqual([
    '2024-01-15',
    '2024-03-20',
    '2024-06-01',
    '2024-07-01',
    '2024-08-01',
  ])
  expect(
    items.map((el) => el.querySelector('.bytemd-timeline-heading')?.textContent)
  ).toEqual(['项目立项', 'Alpha 版本', '正式上线', '严重回滚事件', '用户破万'])
  expect(
    items.map((el) => el.querySelector('.bytemd-timeline-desc')?.textContent)
  ).toEqual(['完成需求评审', '正在联调', undefined, undefined, undefined])
  expect(
    items.map(
      (el) =>
        [...el.classList].find((name) =>
          name.startsWith('bytemd-timeline-item-')
        ) ?? ''
    )
  ).toEqual([
    'bytemd-timeline-item-done',
    'bytemd-timeline-item-doing',
    'bytemd-timeline-item-todo',
    'bytemd-timeline-item-error',
    'bytemd-timeline-item-milestone',
  ])
  expect($.container.querySelectorAll('.bytemd-timeline-marker').length).toBe(5)

  $.component.$destroy()
})

test('unknown status falls back to todo', () => {
  const $ = render(Viewer, {
    value: '::: timeline\n:: [blocked] 2024-09-01 等待依赖\n:::',
  })
  const item = $.container.querySelector('.bytemd-timeline-item')

  expect(item).toHaveClass('bytemd-timeline-item-todo')
  expect(item?.querySelector('.bytemd-timeline-heading')?.textContent).toBe(
    '等待依赖'
  )

  $.component.$destroy()
})

test('unclosed timeline stays plain text', () => {
  const $ = render(Viewer, {
    value: '::: timeline 时间线\n:: [done] 2024-01-15 项目立项',
  })

  expect($.container.querySelector('.bytemd-timeline')).toBeNull()
  expect($.container.textContent).toContain('::: timeline 时间线')

  $.component.$destroy()
})
