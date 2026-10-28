import type { BytemdLocale } from './types'

/**
 * Inject a copy button into every `pre` under `root`, plus a code header
 * carrying the fence language. Idempotent.
 */
export function addCopyButtons(
  root: HTMLElement,
  locale?: Partial<BytemdLocale>,
) {
  root.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code')
    const langClass = Array.from(code?.classList ?? []).find((name) =>
      name.startsWith('language-'),
    )
    if (langClass) {
      pre.dataset.codeLang = langClass.slice('language-'.length)
    }
    pre.classList.add('bytemd-code-block')

    const existing = pre.querySelector<HTMLButtonElement>('.bytemd-copy-btn')
    const btn = existing ?? document.createElement('button')
    btn.type = 'button'
    btn.className = 'bytemd-copy-btn'
    btn.textContent = locale?.copy ?? '复制'
    btn.dataset.copy = locale?.copy ?? '复制'
    btn.dataset.copySuccess = locale?.copySuccess ?? '已复制'
    btn.dataset.copyFailed = locale?.copyFailed ?? '复制失败，请手动选择代码'
    btn.setAttribute('aria-live', 'polite')
    if (!existing) pre.appendChild(btn)
  })
}

/**
 * Copy the code content of the `pre` that contains `btn`,
 * then flash the button text to `已复制`.
 */
export async function copyCodeFromButton(btn: HTMLButtonElement) {
  const pre = btn.closest('pre')
  if (!pre) return
  const text = pre.querySelector('code')?.textContent ?? ''
  const done = () => {
    if (!btn.isConnected) return
    btn.textContent = btn.dataset.copySuccess ?? '已复制'
    setTimeout(() => {
      if (btn.isConnected) btn.textContent = btn.dataset.copy ?? '复制'
    }, 1200)
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      const previousFocus = document.activeElement as HTMLElement | null
      ta.value = text
      ta.style.cssText = 'position:fixed;left:-9999px;top:0'
      document.body.appendChild(ta)
      try {
        ta.select()
        if (!document.execCommand('copy'))
          throw new Error('Copy command failed')
      } finally {
        ta.remove()
        if (previousFocus?.isConnected) previousFocus.focus()
      }
    }
    done()
    return true
  } catch {
    if (btn.isConnected)
      btn.textContent = btn.dataset.copyFailed ?? '复制失败，请手动选择代码'
    return false
  }
}

/** Handle local fragments without interpolating user input into CSS selectors. */
export function scrollToAnchor(root: HTMLElement, event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest('a')
  if (!anchor || !root.contains(anchor)) return
  const href = anchor.getAttribute('href')
  if (!href?.startsWith('#')) return
  let id: string
  try {
    id = decodeURIComponent(href.slice(1))
  } catch {
    return
  }
  if (!id) return
  const prefixed = 'user-content-' + id
  const destination = [...root.querySelectorAll<HTMLElement>('[id]')].find(
    (element) => element.id === prefixed || element.id === id,
  )
  if (destination) {
    event.preventDefault()
    destination.scrollIntoView()
    return
  }
  // A rendered heading has no id unless a slug plugin adds one. Letting the
  // browser handle such a missing fragment scrolls the host page (often back
  // to the editor). Only suppress fragments that resolve nowhere on the page;
  // links deliberately pointing outside the viewer keep native behavior.
  const doc = root.ownerDocument
  if (!doc.getElementById(id) && !doc.getElementById(prefixed)) {
    event.preventDefault()
  }
}

export function renderErrorHtml(locale?: Partial<BytemdLocale>) {
  const text = locale?.renderError ?? 'Preview could not be rendered.'
  const escaped = text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  )
  return `<p role="alert" class="bytemd-render-error">${escaped}</p>`
}

export { getProcessor } from './processor'
