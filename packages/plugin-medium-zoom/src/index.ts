import type { BytemdPlugin } from 'bytemd'
import type * as M from 'medium-zoom'

export interface BytemdPluginMediumZoomOptions extends M.ZoomOptions {
  filter?: (img: HTMLImageElement) => boolean
}

const MAX_Z = 2147483647

const STYLE_ID = 'bytemd-medium-zoom-styles'
const LIGHTBOX_CSS = `
.medium-zoom-overlay {
  z-index: ${MAX_Z - 2} !important;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
.medium-zoom-image--opened {
  z-index: ${MAX_Z - 1} !important;
  border-radius: 6px;
}
.bytemd-zoom-ui {
  position: fixed;
  inset: 0;
  z-index: ${MAX_Z} !important;
  pointer-events: none;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  opacity: 1;
  transition: opacity 0.18s ease;
}
.bytemd-zoom-ui.is-closing {
  opacity: 0;
  pointer-events: none;
}
.bytemd-zoom-ui button {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}
.bytemd-zoom-ui button:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.32);
}
.bytemd-zoom-ui button:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.bytemd-zoom-ui button[hidden],
.bytemd-zoom-caption[hidden],
.bytemd-zoom-counter[hidden] {
  display: none !important;
}
.bytemd-zoom-close {
  position: absolute;
  top: calc(20px + env(safe-area-inset-top, 0px));
  right: calc(24px + env(safe-area-inset-right, 0px));
  width: 42px;
  height: 42px;
  font-size: 26px;
  line-height: 1;
}
.bytemd-zoom-nav {
  position: absolute;
  top: 50%;
  width: 42px;
  height: 42px;
  font-size: 28px;
  line-height: 1;
  transform: translateY(-50%);
}
.bytemd-zoom-prev {
  left: calc(24px + env(safe-area-inset-left, 0px));
}
.bytemd-zoom-next {
  right: calc(24px + env(safe-area-inset-right, 0px));
}
.bytemd-zoom-caption {
  position: absolute;
  left: 50%;
  bottom: calc(22px + env(safe-area-inset-bottom, 0px));
  max-width: min(80ch, calc(100vw - 160px));
  padding: 8px 14px;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(0, 0, 0, 0.45);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  overflow-wrap: anywhere;
  transform: translateX(-50%);
}
.bytemd-zoom-counter {
  position: absolute;
  top: calc(26px + env(safe-area-inset-top, 0px));
  left: calc(24px + env(safe-area-inset-left, 0px));
  padding: 4px 10px;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(0, 0, 0, 0.35);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
@media (max-width: 640px) {
  .bytemd-zoom-close {
    top: calc(12px + env(safe-area-inset-top, 0px));
    right: calc(12px + env(safe-area-inset-right, 0px));
    width: 38px;
    height: 38px;
    font-size: 23px;
  }
  .bytemd-zoom-nav {
    width: 38px;
    height: 38px;
    font-size: 25px;
  }
  .bytemd-zoom-prev {
    left: calc(10px + env(safe-area-inset-left, 0px));
  }
  .bytemd-zoom-next {
    right: calc(10px + env(safe-area-inset-right, 0px));
  }
  .bytemd-zoom-caption {
    bottom: calc(14px + env(safe-area-inset-bottom, 0px));
    max-width: calc(100vw - 32px);
    font-size: 12px;
  }
  .bytemd-zoom-counter {
    top: calc(16px + env(safe-area-inset-top, 0px));
    left: calc(16px + env(safe-area-inset-left, 0px));
  }
}
@media (prefers-reduced-motion: reduce) {
  .medium-zoom-overlay,
  .medium-zoom-image,
  .bytemd-zoom-ui {
    transition: none !important;
  }
}
`

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = LIGHTBOX_CSS
  document.head.appendChild(style)
}

function makeButton(className: string, label: string, text: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.setAttribute('aria-label', label)
  button.textContent = text
  return button
}

interface Lightbox {
  root: HTMLElement
  caption: HTMLElement
  counter: HTMLElement
  close: HTMLButtonElement
  prev: HTMLButtonElement
  next: HTMLButtonElement
}

// Each UI owns one lock. Closing one viewer must not unlock another viewer.
const bodyLocks = new WeakMap<
  Document,
  { overflow: string; roots: HTMLElement[] }
>()
// medium-zoom has no destroy API and retains document/window listeners after
// detach. Reuse one underlying controller per document; each effect owns only
// its images, options, UI and listeners. The controller coordinates one open image.
const controllers = new WeakMap<Document, M.Zoom>()

function lockBody(root: HTMLElement) {
  const doc = root.ownerDocument
  let state = bodyLocks.get(doc)
  if (!state) {
    state = { overflow: doc.body.style.overflow, roots: [] }
    bodyLocks.set(doc, state)
  }
  state.roots.push(root)
  doc.body.style.overflow = 'hidden'
  return () => {
    const index = state!.roots.indexOf(root)
    if (index >= 0) state!.roots.splice(index, 1)
    if (!state!.roots.length) {
      doc.body.style.overflow = state!.overflow
      bodyLocks.delete(doc)
    }
  }
}

export default function mediumZoom(
  options?: BytemdPluginMediumZoomOptions,
): BytemdPlugin {
  let modulePromise: Promise<typeof M> | undefined
  const { filter, ...zoomOptions } = options ?? {}
  return {
    viewerEffect({ markdownBody, reportError }) {
      let active = true
      let zoom: M.Zoom | undefined
      let images: HTMLImageElement[] = []
      let ui: Lightbox | undefined
      let uiCleanup: (() => void) | undefined
      let closeFallback: ReturnType<typeof setTimeout> | undefined

      // medium-zoom resolves open/close animations via transitionend on the
      // zoomed clone. Hidden or reduced-motion documents may never emit it,
      // leaving the vendor's isAnimating flag stuck and close() a no-op.
      const flushTransition = () => {
        // The vendor always attaches clones to the global document.
        document
          .querySelector('.medium-zoom-image--opened')
          ?.dispatchEvent(new Event('transitionend'))
      }

      const hideUi = () => {
        uiCleanup?.()
        uiCleanup = undefined
        ui?.root.remove()
        ui = undefined
      }

      const currentIndex = () => {
        const image = zoom?.getZoomedImage() as HTMLImageElement | undefined
        const index = image ? images.indexOf(image) : -1
        return index >= 0 ? index : 0
      }

      const showUi = (image: HTMLImageElement) => {
        hideUi()

        // Host the UI in the same document as the preview, not the global one.
        const doc = markdownBody.ownerDocument
        const root = doc.createElement('div')
        root.className = 'bytemd-zoom-ui'
        root.setAttribute('role', 'dialog')
        root.setAttribute('aria-modal', 'true')

        const close = makeButton(
          'bytemd-zoom-close',
          'Close image preview',
          '\u00d7',
        )
        const prev = makeButton(
          'bytemd-zoom-nav bytemd-zoom-prev',
          'Previous image',
          '\u2039',
        )
        const next = makeButton(
          'bytemd-zoom-nav bytemd-zoom-next',
          'Next image',
          '\u203a',
        )
        const caption = document.createElement('div')
        caption.className = 'bytemd-zoom-caption'
        const counter = document.createElement('div')
        counter.className = 'bytemd-zoom-counter'

        const multiple = images.length > 1
        const index = Math.max(images.indexOf(image), 0)
        const text =
          image.getAttribute('title') || image.getAttribute('alt') || ''

        prev.hidden = !multiple
        next.hidden = !multiple
        counter.hidden = !multiple
        caption.hidden = !text
        caption.textContent = text
        if (multiple) counter.textContent = `${index + 1} / ${images.length}`
        root.setAttribute('aria-label', text || 'Image preview')

        root.append(counter, caption, prev, next, close)
        doc.body.append(root)

        const go = (delta: number) => {
          if (!zoom || images.length < 2) return
          const target =
            images[(currentIndex() + delta + images.length) % images.length]
          if (!target) return
          target.scrollIntoView({ block: 'center', inline: 'nearest' })
          // Pagination can also land inside the vendor's isAnimating window;
          // complete any pending transition so close() really closes.
          flushTransition()
          zoom
            .close()
            .then(() => {
              flushTransition()
              return active && target.isConnected
                ? zoom?.open({ target })
                : undefined
            })
            .catch(() => {})
        }

        const onPrev = (event: MouseEvent) => {
          event.stopPropagation()
          go(-1)
        }
        const onNext = (event: MouseEvent) => {
          event.stopPropagation()
          go(1)
        }
        const onClose = (event: MouseEvent) => {
          event.stopPropagation()
          zoom?.close()
        }
        const onKeyDown = (event: KeyboardEvent) => {
          const roots = bodyLocks.get(doc)?.roots
          if (roots?.[roots.length - 1] !== root) return
          if (event.key === 'ArrowLeft' && multiple) {
            event.preventDefault()
            go(-1)
            return
          }
          if (event.key === 'ArrowRight' && multiple) {
            event.preventDefault()
            go(1)
            return
          }
          if (event.key !== 'Tab') return
          const focusable = [close, prev, next].filter((el) => !el.hidden)
          if (focusable.length === 0) return
          event.preventDefault()
          const current = focusable.indexOf(
            doc.activeElement as HTMLButtonElement,
          )
          const step = event.shiftKey ? -1 : 1
          const target =
            focusable[(current + step + focusable.length) % focusable.length]
          target.focus()
        }

        prev.addEventListener('click', onPrev)
        next.addEventListener('click', onNext)
        close.addEventListener('click', onClose)
        doc.addEventListener('keydown', onKeyDown)

        const previousFocus = doc.activeElement as HTMLElement | null
        const unlock = lockBody(root)
        close.focus()

        ui = { root, caption, counter, close, prev, next }
        uiCleanup = () => {
          doc.removeEventListener('keydown', onKeyDown)
          prev.removeEventListener('click', onPrev)
          next.removeEventListener('click', onNext)
          close.removeEventListener('click', onClose)
          const restoreFocus = root.contains(doc.activeElement)
          unlock()
          if (restoreFocus && previousFocus?.isConnected)
            previousFocus.focus?.()
        }
      }

      const onOpen = (event: Event) => {
        showUi(event.target as HTMLImageElement)
      }
      const onClose = () => {
        ui?.root.classList.add('is-closing')
        // A close requested while the opening transition is animating is
        // swallowed by the vendor's isAnimating guard, and a stalled
        // transition would never emit `closed`. Retry after the open
        // animation budget and force-complete as a last resort so the
        // scroll lock and UI are always released.
        clearTimeout(closeFallback)
        closeFallback = setTimeout(() => {
          flushTransition()
          zoom?.close().catch(() => {})
          closeFallback = setTimeout(flushTransition, 100)
        }, 350)
      }
      const onClosed = () => {
        clearTimeout(closeFallback)
        hideUi()
      }

      const imgs = [...markdownBody.querySelectorAll('img')].filter((e) => {
        return (
          (filter?.(e) ?? true) &&
          !e.closest('a') &&
          // Divider icons are decorative; clicking them must not zoom.
          !e.closest('.bytemd-hr-text')
        )
      }) as HTMLImageElement[]
      if (imgs.length === 0) return

      images = imgs
      const configure = () =>
        zoom?.update({
          margin: 32,
          background: 'rgba(8, 10, 14, 0.92)',
          ...zoomOptions,
        })
      const beforeClick = (event: MouseEvent) => {
        if (imgs.includes(event.target as HTMLImageElement)) configure()
      }
      markdownBody.addEventListener('click', beforeClick, true)
      ;(async () => {
        const m = await (modulePromise ??= import('medium-zoom'))
        if (!active) return
        // Inject styles only when there is something to zoom and the module
        // actually loaded; otherwise the stylesheet would be dead weight.
        ensureStyles()
        zoom = controllers.get(markdownBody.ownerDocument)
        if (!zoom) {
          zoom = m.default([])
          controllers.set(markdownBody.ownerDocument, zoom)
        }
        zoom.attach(...imgs)
        imgs.forEach((img) => {
          img.addEventListener('medium-zoom:open', onOpen)
          img.addEventListener('medium-zoom:close', onClose)
          img.addEventListener('medium-zoom:closed', onClosed)
        })
      })().catch((error) => {
        modulePromise = undefined
        if (!active) return
        if (reportError) reportError(error, { plugin: 'medium-zoom' })
        else console.error(error)
      })

      return () => {
        if (!active) return
        active = false
        clearTimeout(closeFallback)
        hideUi()
        markdownBody.removeEventListener('click', beforeClick, true)
        if (zoom) {
          imgs.forEach((img) => {
            img.removeEventListener('medium-zoom:open', onOpen)
            img.removeEventListener('medium-zoom:close', onClose)
            img.removeEventListener('medium-zoom:closed', onClosed)
          })
          if (imgs.includes(zoom.getZoomedImage() as HTMLImageElement)) {
            // Unmount cannot rely on CSS transitionend (hidden/reduced-motion
            // pages may never emit it). Complete opening, then closing, now.
            const clone = document.querySelector('.medium-zoom-image--opened')
            clone?.dispatchEvent(new Event('transitionend'))
            zoom.close().catch(() => {})
            clone?.dispatchEvent(new Event('transitionend'))
            requestAnimationFrame(() => {
              if (!controllers.get(document)?.getZoomedImage())
                document.body.classList.remove('medium-zoom--opened')
            })
          }
          zoom.detach(...imgs)
          zoom = undefined
        }
      }
    },
  }
}
