import en from '../locales/en.json'
import Editor from '../src/editor.svelte'
import Help from '../src/help.svelte'
import type { BytemdEditorContext } from '../src/types'
import '@testing-library/jest-dom'
import { act, fireEvent, render } from '@testing-library/svelte'

test('Tool actions and presets do not submit their host form', async () => {
  const form = document.createElement('form')
  document.body.appendChild(form)
  const submit = vi.fn((event: Event) => event.preventDefault())
  form.addEventListener('submit', submit)
  const click = vi.fn()
  const mounted = render(
    Help,
    {
      target: form,
      props: {
        actions: [
          {
            title: 'Presets',
            handler: {
              type: 'dropdown',
              actions: [{ title: 'First', handler: { type: 'action', click } }],
            },
          },
        ],
        locale: en,
        visible: true,
        context: {
          editor: { focus: vi.fn() },
        } as unknown as BytemdEditorContext,
      },
    },
    { baseElement: form },
  )
  await act()
  ;(form.querySelector('.bytemd-tool-use') as HTMLButtonElement).click()
  ;(form.querySelector('.bytemd-tool-toggle') as HTMLButtonElement).click()
  await act()
  ;(
    form.querySelector('.bytemd-tool-sub .bytemd-tool-use') as HTMLButtonElement
  ).click()
  expect(click).toHaveBeenCalledTimes(2)
  expect(submit).not.toHaveBeenCalled()
  mounted.unmount()
  form.remove()
})

test.each(['Enter', 'Space'])(
  'Tool presets activate once for native %s keyboard clicks',
  async (code) => {
    const mounted = render(Help, {
      actions: [
        {
          title: 'Presets',
          handler: {
            type: 'dropdown',
            actions: [
              { title: 'First', handler: { type: 'action', click: vi.fn() } },
            ],
          },
        },
      ],
      locale: en,
      visible: true,
    })
    const toggle = mounted.container.querySelector('.bytemd-tool-toggle')!
    // jsdom does not synthesize the click that native buttons receive in Chrome.
    await fireEvent.keyDown(toggle, { code })
    await fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(mounted.getByText('First')).toBeVisible()
  },
)

test('Tool font size uses the 20px preset shown in its syntax example', async () => {
  const mounted = render(Editor, { value: 'sample' })
  await act()
  await fireEvent.click(mounted.getByRole('button', { name: en.tool }))
  const row = [...mounted.container.querySelectorAll('.bytemd-tool-item')].find(
    (element) =>
      element.querySelector('.bytemd-help-title')?.textContent === en.fontSize,
  )!
  await fireEvent.click(row.querySelector('.bytemd-tool-use')!)
  const element = mounted.container.querySelector(
    '.CodeMirror',
  ) as HTMLElement & {
    CodeMirror: { getValue(): string }
  }
  expect(element.CodeMirror.getValue()).toBe('[size=20]sample[/size]')
})

test('destroying an Editor releases its resize listener while a peer remains mounted', async () => {
  const warmup = render(Editor, { value: '' })
  await act()
  warmup.unmount()
  await act()
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  try {
    const first = render(Editor, { value: 'first' })
    await act()
    const firstListeners = add.mock.calls
      .filter(([type]) => type === 'resize')
      .map(([, listener]) => listener)
    expect(firstListeners.length).toBeGreaterThan(0)
    add.mockClear()
    const second = render(Editor, { value: 'second' })
    await act()
    const secondListeners = add.mock.calls
      .filter(([type]) => type === 'resize')
      .map(([, listener]) => listener)
    expect(secondListeners.length).toBeGreaterThan(0)
    first.unmount()
    await act()
    const removed = remove.mock.calls
      .filter(([type]) => type === 'resize')
      .map(([, listener]) => listener)
    for (const listener of firstListeners) expect(removed).toContain(listener)
    for (const listener of secondListeners)
      expect(removed).not.toContain(listener)
    window.dispatchEvent(new Event('resize'))
    await act()
    expect(second.container.querySelector('.CodeMirror')).not.toBeNull()
    second.unmount()
    await act()
    const allRemoved = remove.mock.calls
      .filter(([type]) => type === 'resize')
      .map(([, listener]) => listener)
    for (const listener of secondListeners)
      expect(allRemoved).toContain(listener)
  } finally {
    add.mockRestore()
    remove.mockRestore()
  }
})

test('a narrow Tool action changes Markdown and returns from Preview to Write', async () => {
  const width = window.innerWidth
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 390,
  })
  try {
    const mounted = render(Editor, { value: 'sample', mode: 'split' })
    await act()
    await fireEvent.click(mounted.getByRole('tab', { name: en.preview }))
    await fireEvent.click(mounted.getByRole('button', { name: en.tool }))
    await fireEvent.click(mounted.container.querySelector('.bytemd-tool-use')!)
    expect(mounted.getByRole('tab', { name: en.write })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(mounted.container.querySelector('.bytemd-editor')).toBeVisible()
    const element = mounted.container.querySelector(
      '.CodeMirror',
    ) as HTMLElement & {
      CodeMirror: { getValue(): string }
    }
    expect(element.CodeMirror.getValue()).toBe('[size=20]sample[/size]')
    // jsdom does not load the distributed CSS; Chrome verifies its visibility.
    expect(mounted.container.querySelector('.bytemd-tool')).toHaveClass(
      'bytemd-hidden',
    )
  } finally {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: width,
    })
  }
})

test('a narrow forced-split editor keeps Preview selected on repeated tab clicks', async () => {
  const width = window.innerWidth
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 390,
  })
  try {
    const mounted = render(Editor, { value: '# Preview', mode: 'split' })
    await act()
    const previewTab = mounted.getByRole('tab', { name: 'Preview' })
    await fireEvent.click(previewTab)
    await fireEvent.click(previewTab)
    expect(previewTab).toHaveAttribute('aria-selected', 'true')
    expect(mounted.container.querySelector('.bytemd-preview')).toBeVisible()
  } finally {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: width,
    })
  }
})
