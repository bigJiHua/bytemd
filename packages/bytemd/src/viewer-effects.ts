import type { BytemdPlugin, BytemdPluginError, BytemdLocale } from './types'
import type { VFile } from 'vfile'

/** Run DOM enhancements with shared feedback and a render-scoped lifetime. */
export function runViewerEffects(
  markdownBody: HTMLElement,
  file: VFile,
  plugins: BytemdPlugin[] = [],
  locale?: Partial<BytemdLocale>,
): () => void {
  let active = true
  const messages = new Map<HTMLElement, Map<string, HTMLElement>>()
  const reportError = (
    error: unknown,
    { plugin, element }: { plugin?: string; element?: HTMLElement } = {},
  ) => {
    if (!active || (element && !markdownBody.contains(element))) return
    const target = element ?? markdownBody
    let byPlugin = messages.get(target)
    if (!byPlugin) messages.set(target, (byPlugin = new Map()))
    const key = plugin ?? ''
    let message = byPlugin.get(key)
    if (!message) {
      message = markdownBody.ownerDocument.createElement('p')
      message.className = 'bytemd-plugin-error'
      message.setAttribute('role', 'alert')
      if (plugin) message.dataset.bytemdPlugin = plugin
      message.textContent = `${plugin ? `${plugin}: ` : ''}${
        locale?.pluginError ??
        'Preview enhancement failed. Check the content or plugin.'
      }`
      if (element && element !== markdownBody) {
        // Inline math must not receive a block paragraph inside its paragraph.
        let block = element
        while (block.parentElement && block.parentElement !== markdownBody)
          block = block.parentElement
        block.after(message)
      } else markdownBody.appendChild(message)
      byPlugin.set(key, message)
    }
    const detail: BytemdPluginError = { error, plugin, element, file }
    const Event = markdownBody.ownerDocument.defaultView!.CustomEvent
    markdownBody.dispatchEvent(
      new Event('bytemd-plugin-error', { bubbles: true, detail }),
    )
  }
  const cleanups = plugins.map(({ viewerEffect }) => {
    try {
      return viewerEffect?.({ markdownBody, file, reportError })
    } catch (error) {
      reportError(error)
    }
  })
  return () => {
    if (!active) return
    active = false
    for (const cleanup of cleanups) {
      try {
        cleanup?.()
      } catch (error) {
        // One faulty plugin must not prevent the remaining effects cleaning up.
        console.error(error)
      }
    }
    for (const byPlugin of messages.values())
      for (const message of byPlugin.values()) message.remove()
    messages.clear()
  }
}
