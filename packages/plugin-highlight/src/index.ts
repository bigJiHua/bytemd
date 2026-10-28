import type { BytemdPlugin } from 'bytemd'
import type H from 'highlight.js'

export interface BytemdPluginHighlightOptions {
  init?(hljs: typeof H): void | Promise<void>
}

export default function highlight({
  init,
}: BytemdPluginHighlightOptions = {}): BytemdPlugin {
  let ready: Promise<typeof H> | undefined
  const load = () => {
    if (!ready)
      ready = import('highlight.js')
        .then(async (module) => {
          if (init) await init(module.default)
          return module.default
        })
        .catch((error) => {
          ready = undefined
          throw error
        })
    return ready
  }
  return {
    viewerEffect({ markdownBody, reportError }) {
      let active = true
      const pending = new Map<ReturnType<typeof setTimeout>, () => void>()
      const yieldToBrowser = () => {
        const scheduler = (
          globalThis as typeof globalThis & {
            scheduler?: { yield?: () => Promise<void> }
          }
        ).scheduler
        if (scheduler?.yield) return scheduler.yield()
        return new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            pending.delete(timer)
            resolve()
          }, 0)
          pending.set(timer, resolve)
        })
      }
      const originals = new Map<
        HTMLElement,
        { html: string; className: string; highlighted?: string }
      >()
      const restore = (
        el: HTMLElement,
        original: { html: string; className: string; highlighted?: string },
      ) => {
        el.innerHTML = original.html
        el.className = original.className
        if (original.highlighted === undefined) delete el.dataset.highlighted
        else el.dataset.highlighted = original.highlighted
      }
      ;(async () => {
        const els = markdownBody.querySelectorAll<HTMLElement>('pre>code')
        if (els.length === 0) return

        const fail = (error: unknown, el: HTMLElement) => {
          if (!active || !markdownBody.contains(el)) return
          if (reportError)
            reportError(error, {
              plugin: 'highlight.js',
              element: el.parentElement!,
            })
          else console.error(error)
        }
        let hljs: typeof H
        try {
          hljs = await load()
        } catch (error) {
          els.forEach((el) => fail(error, el))
          return
        }

        let batchStarted = performance.now()
        for (const el of els) {
          if (!active) break
          // The budget is soft: one library call cannot be interrupted.
          if (performance.now() - batchStarted >= 8) {
            await yieldToBrowser()
            if (!active) break
            batchStarted = performance.now()
          }
          if (!markdownBody.contains(el)) continue
          const original = {
            html: el.innerHTML,
            className: el.className,
            highlighted: el.dataset.highlighted,
          }
          originals.set(el, original)
          try {
            hljs.highlightElement(el)
          } catch (error) {
            restore(el, original)
            fail(error, el)
          }
        }
      })().catch((error) => {
        if (active) console.error(error)
      })
      return () => {
        active = false
        pending.forEach((resolve, timer) => {
          clearTimeout(timer)
          resolve()
        })
        pending.clear()
        originals.forEach((original, el) => {
          if (markdownBody.contains(el)) restore(el, original)
        })
        originals.clear()
      }
    },
  }
}
