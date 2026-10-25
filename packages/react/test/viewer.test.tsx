import { testViewer } from '../../bytemd/test/viewer-contract'
import { Viewer } from '../src/viewer'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

describe('React Viewer contract', () => {
  testViewer(async (props) => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<Viewer {...props} />)
    })
    return {
      root: container,
      async update(nextProps) {
        await act(async () => {
          root.render(<Viewer {...nextProps} />)
        })
      },
      async destroy() {
        await act(async () => root.unmount())
        container.remove()
        delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT
      },
    }
  })
})
