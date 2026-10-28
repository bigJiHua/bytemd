/// <reference types="vitest/globals" />
import Viewer from '../src/viewer.svelte'
import '@testing-library/jest-dom'
import { render } from '@testing-library/svelte'

test('renders a centered text divider', () => {
  const $ = render(Viewer, { value: '---你好---' })
  const divider = $.container.querySelector('.bytemd-hr-text')
  const label = divider?.querySelector('.bytemd-hr-text-label')

  expect(divider).toBeInTheDocument()
  expect(label?.textContent).toBe('你好')
  expect(divider?.querySelectorAll('.bytemd-hr-text-line').length).toBe(2)
  expect(divider?.getAttribute('style')).toContain('display:flex')
  expect(label?.getAttribute('style')).toContain('text-align:center')
  expect($.container.querySelector('hr')).toBeNull()
  expect(divider?.textContent).not.toContain('---')

  $.unmount()
})

test('plain --- stays a horizontal rule', () => {
  const $ = render(Viewer, { value: '---' })

  expect($.container.querySelector('hr')).toBeInTheDocument()
  expect($.container.querySelector('.bytemd-hr-text')).toBeNull()

  $.unmount()
})

test('allows an image label and caps it to icon size', () => {
  const $ = render(Viewer, {
    value: "---![ByteMD 插件管线](./plugin.svg 'ByteMD 插件系统')---",
  })
  const divider = $.container.querySelector('.bytemd-hr-text')
  const label = divider?.querySelector('.bytemd-hr-text-label')
  const image = label?.querySelector('img')
  const style = image?.getAttribute('style') ?? ''

  expect(image).toBeInTheDocument()
  expect(image?.getAttribute('alt')).toBe('ByteMD 插件管线')
  expect(image?.getAttribute('title')).toBe('ByteMD 插件系统')
  expect(style).toContain('max-height:2em')
  expect(style).toContain('max-width:8em')
  expect(divider?.querySelectorAll('.bytemd-hr-text-line').length).toBe(2)

  $.unmount()
})

test('keeps inline Markdown inside the label', () => {
  const $ = render(Viewer, { value: '---**重点**与`code`---' })
  const label = $.container.querySelector('.bytemd-hr-text-label')

  expect(label?.querySelector('strong')?.textContent).toBe('重点')
  expect(label?.querySelector('code')?.textContent).toBe('code')
  expect(label?.textContent).toBe('重点与code')

  $.unmount()
})

test('keeps inline style ranges inside the label', () => {
  const $ = render(Viewer, {
    value: '---[size=24][color=#e03131]红字[/color][/size]---',
  })
  const label = $.container.querySelector('.bytemd-hr-text-label')
  const color = label?.querySelector('span.bytemd-color-e03131')

  expect(label?.querySelector('span.bytemd-size-24')).toBeInTheDocument()
  expect(color?.getAttribute('style')).toContain('color:#e03131')
  expect(color?.textContent).toBe('红字')

  $.unmount()
})

test('leaves multi-line and four-hyphen ranges as text', () => {
  const $ = render(Viewer, {
    value: '---第一行\n第二行---\n\n----你好----',
  })
  const body = $.container.querySelector('.markdown-body') as HTMLElement

  expect($.container.querySelector('.bytemd-hr-text')).toBeNull()
  expect(body.textContent).toContain('---第一行')
  expect(body.textContent).toContain('----你好----')

  $.unmount()
})
