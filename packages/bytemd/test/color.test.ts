/// <reference types="vitest/globals" />
import Viewer from '../src/viewer.svelte'
import '@testing-library/jest-dom'
import { render } from '@testing-library/svelte'

test('applies font color and background color after sanitize', () => {
  const $ = render(Viewer, {
    value: '[color=#e03131]红色[/color] [bg=#fff3bf]高亮[/bg]',
  })
  const color = $.container.querySelector('span.bytemd-color-e03131')
  const bg = $.container.querySelector('span.bytemd-bg-fff3bf')

  expect(color?.getAttribute('style')).toContain('color:#e03131')
  expect(color?.textContent).toBe('红色')
  expect(bg?.getAttribute('style')).toContain('background-color:#fff3bf')
  expect(bg?.textContent).toBe('高亮')

  $.unmount()
})

test('normalizes hex colors and keeps inline nodes', () => {
  const $ = render(Viewer, {
    value: '[color=#E03131]**加粗**与`code`[/color]',
  })
  const span = $.container.querySelector('span.bytemd-color-e03131')

  expect(span?.querySelector('strong')?.textContent).toBe('加粗')
  expect(span?.querySelector('code')?.textContent).toBe('code')
  expect(span?.getAttribute('style')).toContain('color:#e03131')

  $.unmount()
})

test('nests size, font color and background color', () => {
  const $ = render(Viewer, {
    value: '[size=24][color=#1971c2][bg=#fff3bf]组合[/bg][/color][/size]',
  })
  const size = $.container.querySelector('span.bytemd-size-24')
  const color = size?.querySelector('span.bytemd-color-1971c2')
  const bg = color?.querySelector('span.bytemd-bg-fff3bf')

  expect(bg?.textContent).toBe('组合')
  expect(bg?.getAttribute('style')).toContain('background-color:#fff3bf')
  expect(color?.getAttribute('style')).toContain('color:#1971c2')
  expect(size?.getAttribute('style')).toContain('font-size:24px')

  $.unmount()
})

test('invalid or mismatched color markers stay literal', () => {
  const $ = render(Viewer, {
    value:
      '[color=red]名称色[/color]\n\n[color=#12345]短色值[/color]\n\n[color=#e03131]错配[/size]',
  })
  const body = $.container.querySelector('.markdown-body') as HTMLElement

  expect($.container.querySelector('[class*="bytemd-color-"]')).toBeNull()
  expect(body.textContent).toContain('[color=red]')
  expect(body.textContent).toContain('[color=#12345]')
  expect(body.textContent).toContain('[color=#e03131]错配[/size]')

  $.unmount()
})
