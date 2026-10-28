import en from './locales/en.json'
import { MathLocale, getMathActions } from './utils'
import type { BytemdPlugin } from 'bytemd'
import type { default as K, KatexOptions } from 'katex'
import remarkMath from 'remark-math'

export interface BytemdPluginMathOptions {
  locale?: Partial<MathLocale>
  katexOptions?: Omit<KatexOptions, 'displayMode'>
}

export default function math({
  locale: _locale,
  katexOptions,
}: BytemdPluginMathOptions = {}): BytemdPlugin {
  const locale = { ...en, ..._locale }
  let ready: Promise<typeof K> | undefined
  const load = () => {
    if (!ready)
      ready = import('katex')
        .then((module) => module.default)
        .catch((error) => {
          ready = undefined
          throw error
        })
    return ready
  }

  return {
    remark: (processor) => processor.use(remarkMath),
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
      const originals = new Map<HTMLElement, string>()
      const renderMath = async (selector: string, displayMode: boolean) => {
        const els = markdownBody.querySelectorAll<HTMLElement>(selector)
        if (els.length === 0) return

        const fail = (error: unknown, el: HTMLElement) => {
          if (!active || !markdownBody.contains(el)) return
          if (reportError) reportError(error, { plugin: 'KaTeX', element: el })
          else console.error(error)
        }
        let katex: typeof K
        try {
          katex = await load()
        } catch (error) {
          els.forEach((el) => fail(error, el))
          return
        }

        let batchStarted = performance.now()
        for (const el of els) {
          if (!active) break
          // The budget is soft: one expression cannot be interrupted.
          if (performance.now() - batchStarted >= 8) {
            await yieldToBrowser()
            if (!active) break
            batchStarted = performance.now()
          }
          if (!markdownBody.contains(el)) continue
          const source = el.textContent ?? ''
          originals.set(el, el.innerHTML)
          try {
            katex.render(source, el, {
              ...katexOptions,
              throwOnError: true,
              displayMode,
            })
            // Handle error markup as well as thrown parse errors.
            const parseError = el.querySelector<HTMLElement>('.katex-error')
            if (parseError) {
              const error = new Error(
                parseError.title || 'Invalid math expression'
              )
              el.textContent = source
              fail(error, el)
            }
          } catch (error) {
            el.textContent = source
            fail(error, el)
          }
        }
      }

      renderMath('.math.math-inline', false).catch((error) => {
        if (active) console.error(error)
      })
      renderMath('.math.math-display', true).catch((error) => {
        if (active) console.error(error)
      })
      return () => {
        active = false
        pending.forEach((resolve, timer) => {
          clearTimeout(timer)
          resolve()
        })
        pending.clear()
        originals.forEach((html, el) => {
          if (markdownBody.contains(el)) el.innerHTML = html
        })
        originals.clear()
      }
    },
    actions: getMathActions(locale),
  }
}
