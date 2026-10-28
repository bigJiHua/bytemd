import { Editor } from '../src/editor'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { tick } from 'svelte'

test('React forwards layout containment and restores the default when the prop is removed', async () => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(<Editor value="Document" layoutContainment />)
      await tick()
    })
    expect(container.querySelector('.bytemd-body-contained')).not.toBeNull()
    const editor = (container.querySelector('.CodeMirror') as any).CodeMirror
    await act(async () => {
      root.render(<Editor value="Document" />)
      await tick()
    })
    expect(container.querySelector('.bytemd-body-contained')).toBeNull()
    expect((container.querySelector('.CodeMirror') as any).CodeMirror).toBe(
      editor
    )
    expect(editor.getValue()).toBe('Document')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT
  }
})
