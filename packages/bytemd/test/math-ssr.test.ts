/// <reference types="vitest/globals" />
import mathSsr from '../../plugin-math-ssr/src'
import Viewer from '../src/viewer.svelte'
import { act, cleanup, render } from '@testing-library/svelte'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('SSR math keeps inline, display and valid trusted HTML data rendering', () => {
  const result = render(Viewer, {
    value:
      'Inline $x^2+1$.\n\n$$\n\\sum_{k=1}^n k\n$$\n\n$\\htmlData{note=approved}{x}$',
    plugins: [mathSsr({ katexOptions: { trust: true, strict: 'ignore' } })],
  })
  expect(result.container.querySelectorAll('.katex')).toHaveLength(3)
  expect(result.container.querySelectorAll('.katex-display')).toHaveLength(1)
  expect(
    result.container.querySelector('[data-note="approved"]')
  ).not.toBeNull()
  expect(result.container.querySelector('.katex-error')).toBeNull()
})

test('SSR math rejects injected HTML attribute names and recovers on safe input', async () => {
  // KaTeX 0.15.6 emitted data-x onmouseover="alert(1)" for this payload.
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})
  const result = render(Viewer, {
    value: '$\\htmlData{x onmouseover=alert(1)}{X}$',
    plugins: [
      mathSsr({
        katexOptions: {
          trust: (context) => context.command === '\\htmlData',
          strict: 'ignore',
        },
      }),
    ],
  })
  expect(result.container.querySelector('[onmouseover]')).toBeNull()
  expect(result.container.querySelector('[role="alert"]')).not.toBeNull()
  expect(report).toHaveBeenCalled()
  result.component.$set({ value: '$x^2+1$' })
  await act()
  expect(result.container.querySelector('[role="alert"]')).toBeNull()
  expect(result.container.querySelector('.katex')).not.toBeNull()
})

test('SSR math does not enable unsafe links under its default trust policy', () => {
  const result = render(Viewer, {
    value: '$\\href{javascript:alert(1)}{X}$',
    plugins: [mathSsr()],
  })
  expect(result.container.querySelector('a[href^="javascript:"]')).toBeNull()
  expect(result.container.querySelector('.katex')).not.toBeNull()
})
