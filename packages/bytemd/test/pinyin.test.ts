/// <reference types="vitest/globals" />
import Viewer from '../src/viewer.svelte'
import '@testing-library/jest-dom'
import { render } from '@testing-library/svelte'

test('pinyin pairs each character', () => {
  const $ = render(Viewer, { value: '{ 拼 音|Ping Yin }' })
  const items = [
    ...$.container.querySelectorAll<HTMLElement>('.bytemd-pinyin-item'),
  ]

  expect($.container.querySelectorAll('.bytemd-pinyin').length).toBe(1)
  expect(items.length).toBe(2)
  expect(
    items.map((el) => el.querySelector('.bytemd-pinyin-rt')?.textContent),
  ).toEqual(['Ping', 'Yin'])
  expect(items.map((el) => el.textContent)).toEqual(['Ping拼', 'Yin音'])
  expect($.container.querySelector('.bytemd-pinyin')).toHaveAttribute(
    'title',
    'Ping Yin',
  )

  $.unmount()
})

test('pinyin syllable is capped at five characters', () => {
  const $ = render(Viewer, {
    value: '{ 拼 音|Zhangdddddddddddddddd Yin }',
  })
  const rt = [...$.container.querySelectorAll<HTMLElement>('.bytemd-pinyin-rt')]

  expect(rt.map((el) => el.textContent)).toEqual(['Zhang', 'Yin'])
  expect($.container.querySelector('.bytemd-pinyin')).toHaveAttribute(
    'title',
    'Zhangdddddddddddddddd Yin',
  )

  $.unmount()
})

test('multiple annotations keep surrounding text', () => {
  const $ = render(Viewer, { value: '{拼|Pin} 和 {音|Yin} 都在' })

  expect($.container.querySelectorAll('.bytemd-pinyin').length).toBe(2)
  expect($.container.textContent).toBe('Pin拼 和 Yin音 都在')

  $.unmount()
})

test('unbalanced syllables use one annotation', () => {
  const $ = render(Viewer, { value: '{拼音|Ping}' })
  const items = $.container.querySelectorAll('.bytemd-pinyin-item')

  expect(items.length).toBe(1)
  expect(items[0].querySelector('.bytemd-pinyin-rt')?.textContent).toBe('Ping')
  expect(items[0].textContent).toBe('Ping拼音')

  $.unmount()
})

test('pinyin inside inline code is untouched', () => {
  const $ = render(Viewer, { value: '`{拼 音|Ping Yin}`' })

  expect($.container.querySelector('.bytemd-pinyin')).toBeNull()
  expect($.container.textContent).toContain('{拼 音|Ping Yin}')

  $.unmount()
})
