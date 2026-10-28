import { renderMarkdown } from './processor'
import type { BytemdRenderer, RenderOptions, RenderState } from './render-types'

/** One render lifetime shared by all framework wrappers. */
export function createRenderController(commit: (state: RenderState) => void) {
  let version = 0
  let active = true
  let abort: AbortController | undefined
  return {
    render(options: RenderOptions, renderer?: BytemdRenderer) {
      if (!active) return
      const current = ++version
      abort?.abort()
      abort = new AbortController()
      const request = { ...options, version: current, signal: abort.signal }
      const accept = (state: RenderState) => {
        if (active && version === current) commit(state)
      }
      if (!renderer) {
        try {
          accept({ status: 'ready', result: renderMarkdown(request) })
        } catch (error) {
          accept({ status: 'error', value: options.value, error })
        }
      } else {
        accept({ status: 'pending', value: options.value })
        Promise.resolve()
          .then(() => {
            if (request.signal.aborted) return
            return renderer(request)
          })
          .then(
            (result) => {
              if (result && result.value === options.value)
                accept({ status: 'ready', result })
              else if (!request.signal.aborted)
                accept({
                  status: 'error',
                  value: options.value,
                  error: new Error('Invalid renderer result.'),
                })
            },
            (error) => accept({ status: 'error', value: options.value, error })
          )
      }
    },
    destroy() {
      active = false
      version++
      abort?.abort()
    },
  }
}
