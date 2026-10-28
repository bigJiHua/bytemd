/// <reference types="vitest/globals" />
import Viewer from '../src/viewer.svelte'
import '@testing-library/jest-dom'
import { render } from '@testing-library/svelte'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('playground fixture keeps accordion and timeline block boundaries', () => {
  // vitest 1 + vite 5 may serve a non-file scheme for import.meta.url here,
  // so resolve the fixture from the repository root instead.
  const value = readFileSync(
    resolve(process.cwd(), 'playground/src/text.md'),
    'utf8',
  )
  const $ = render(Viewer, { value })
  try {
    expect($.container.querySelectorAll('.bytemd-accordion')).toHaveLength(1)
    const items = $.container.querySelectorAll('details.bytemd-accordion-item')
    expect(items).toHaveLength(3)
    expect(items[1]).toHaveAttribute('open')
    expect(items[1].querySelector('.bytemd-accordion-body')).toHaveTextContent(
      '这段内容默认展开。',
    )
    expect($.container.querySelectorAll('.bytemd-timeline')).toHaveLength(1)
    expect($.container.querySelectorAll('.bytemd-timeline-item')).toHaveLength(
      5,
    )
    expect(
      $.container.querySelector('.bytemd-timeline-desc'),
    ).toHaveTextContent('完成需求评审')
  } finally {
    $.unmount()
  }
})
