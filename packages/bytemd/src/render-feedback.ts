import type { BytemdLocale } from './types'

/** Text-only feedback shared by wrappers which render HTML strings. */
export function renderPendingHtml(locale?: Partial<BytemdLocale>) {
  const escaped = (locale?.renderPending ?? 'Rendering preview…').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  )
  return `<p role="status" class="bytemd-render-pending">${escaped}</p>`
}
