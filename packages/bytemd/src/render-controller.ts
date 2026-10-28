import { renderMarkdown } from './processor'
import type { BytemdRenderer, RenderOptions, RenderState } from './render-types'

/** Array contents can change without the array identity changing. */
function samePlugins(a: RenderOptions['plugins'], b: RenderOptions['plugins']) {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Object options can be mutated in place, and proving deep equality is not
 * possible (schemas may contain functions), so they never qualify for the
 * redundant-render shortcut.
 */
function isPrimitive(value: unknown) {
  return (
    value === null || (typeof value !== 'object' && typeof value !== 'function')
  )
}

/** One render lifetime shared by all framework wrappers. */
export function createRenderController(commit: (state: RenderState) => void) {
  let version = 0
  let active = true
  let abort: AbortController | undefined
  let lastOptions: RenderOptions | undefined
  let lastRenderer: BytemdRenderer | undefined
  return {
    render(options: RenderOptions, renderer?: BytemdRenderer) {
      if (!active) return
      // Coarse-grained prop bridges (Svelte 5 compat, framework proxies) can
      // re-trigger with identical values; a redundant render would abort the
      // in-flight one and drop its result, so skip when nothing changed.
      // `plugins` is compared by snapshot because hosts may push or replace
      // entries in place; object options stay excluded so a mutation still
      // produces a new render.
      if (
        lastOptions &&
        lastRenderer === renderer &&
        lastOptions.value === options.value &&
        samePlugins(lastOptions.plugins, options.plugins) &&
        isPrimitive(options.sanitize) &&
        lastOptions.sanitize === options.sanitize &&
        isPrimitive(options.remarkRehype) &&
        lastOptions.remarkRehype === options.remarkRehype &&
        isPrimitive(options.headingIds) &&
        lastOptions.headingIds === options.headingIds &&
        lastOptions.sourceMap === options.sourceMap
      )
        return
      lastOptions = {
        ...options,
        plugins: options.plugins ? [...options.plugins] : options.plugins,
      }
      lastRenderer = renderer
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
            (error) => accept({ status: 'error', value: options.value, error }),
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
