/// <reference types="vitest/globals" />
import { Editor as EditorCompat } from '../src'
import Editor from '../src/editor.svelte'
import '@testing-library/jest-dom'
import {
  render,
  cleanup,
  fireEvent,
  act,
  RenderResult,
} from '@testing-library/svelte'

function sleep(ms: number = 0) {
  return new Promise((r) => setTimeout(r, ms))
}

function getCodeMirror($: RenderResult) {
  const dom = $.container.querySelector('.CodeMirror') as any
  return dom.CodeMirror as CodeMirror.Editor
}

function stripComment(str: string) {
  return str.replace(/<\!--.*?-->/g, '')
}

const heading = '# title'
const paragraph = 'abc'

beforeEach(() => {
  cleanup()
})

test('value', async () => {
  const host = document.body.appendChild(document.createElement('div'))
  // Svelte 5 dispatcher events reach compat `$on` listeners, not the DOM.
  // The compat class from the package index mirrors the wrapper packages.
  const mounted = new EditorCompat({ target: host, props: { value: heading } })
  const onChange = vi.fn()
  mounted.$on('change', onChange)
  await act()
  expect(host.querySelector('.CodeMirror') != null).toBe(true)
  const editor = (host.querySelector('.CodeMirror') as any).CodeMirror

  // change from props does not emit `change`
  mounted.$set({ value: heading })
  await act()
  expect(editor.getValue()).toEqual(heading)
  expect(onChange).not.toBeCalled()
  mounted.$destroy()
  host.remove()
})

test('preview debounce', async () => {
  const $ = render(Editor, {})
  await $.rerender({ value: paragraph })
  expect(
    stripComment($.container.querySelector('.markdown-body').innerHTML),
  ).toEqual('')
  await sleep(400)
  const body = $.container.querySelector('.markdown-body')!
  expect(body.querySelectorAll('p')).toHaveLength(1)
  expect(body.querySelector('p')).toHaveTextContent(paragraph)
})

describe('mode', () => {
  test('split', async () => {
    const $ = render(Editor, { mode: 'split' })
    await act()
    expect($.container.querySelector('.bytemd-editor')).toBeVisible()
    expect($.container.querySelector('.bytemd-preview')).toBeVisible()

    const handle = $.container.querySelector('.bytemd-split-handle')!
    expect(handle).toHaveAttribute('role', 'separator')
    expect(handle).toHaveAttribute('aria-valuenow', '50')
    expect(handle).toHaveAttribute('tabindex', '0')

    await fireEvent.keyDown(handle, { code: 'ArrowRight' })
    expect(handle).toHaveAttribute('aria-valuenow', '55')

    const icon = $.container.querySelector(
      '.bytemd-toolbar-left .bytemd-toolbar-icon',
    )
    expect(icon).toHaveAttribute('role', 'button')
    expect(icon).toHaveAttribute('tabindex', '0')
  })

  test('tab', async () => {
    const $ = render(Editor, { mode: 'tab' })
    const write = $.getByText('Write')
    const preview = $.getByText('Preview')

    expect($.container.querySelector('.bytemd-editor')).toBeVisible()
    expect(write).toHaveClass('bytemd-toolbar-tab-active')
    expect(preview).not.toHaveClass('bytemd-toolbar-tab-active')
    expect(write).toHaveAttribute('role', 'tab')
    expect(write).toHaveAttribute('aria-selected', 'true')

    const narrowActions = $.container.querySelectorAll(
      '.bytemd-toolbar-actions .bytemd-toolbar-icon',
    )
    expect(narrowActions.length).toBeGreaterThan(0)

    await fireEvent.click(preview)
    expect(write).not.toHaveClass('bytemd-toolbar-tab-active')
    expect($.container.querySelector('.bytemd-preview')).toBeVisible()
    expect(preview).toHaveClass('bytemd-toolbar-tab-active')
    expect(preview).toHaveAttribute('aria-selected', 'true')
  })
})

describe('plugin', () => {
  test('editor effect', async () => {
    const $ = render(Editor, {})
    const editorOff = vi.fn()
    const editorEffect = vi.fn(() => editorOff)

    await $.rerender({ plugins: [{ editorEffect }] })
    await act()
    expect(editorEffect).toBeCalled()
    expect(editorEffect).toBeCalledTimes(1)
    expect(editorEffect).toBeCalledWith<any>(
      expect.objectContaining({
        // $el: $.container.querySelector('.bytemd'),
        editor: getCodeMirror($),
      }),
    )

    await $.rerender({ plugins: [{ editorEffect }] })
    await act()
    expect(editorOff).toBeCalled()
    expect(editorOff).toBeCalledTimes(1)
  })
})
