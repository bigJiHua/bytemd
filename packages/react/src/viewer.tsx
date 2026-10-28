import * as bytemd from 'bytemd/viewer'
import React, { useMemo, useEffect, useRef, useState, FC } from 'react'

export interface ViewerProps extends bytemd.ViewerProps {}

export const Viewer: FC<ViewerProps> = ({
  value,
  sanitize,
  plugins,
  remarkRehype,
  headingIds,
  locale,
  renderer,
}) => {
  const elRef = useRef<HTMLDivElement>(null)
  const request = useMemo(
    () => ({ value, sanitize, plugins, remarkRehype, headingIds }),
    [value, sanitize, plugins, remarkRehype, headingIds, renderer]
  )
  const [asyncState, setAsyncState] = useState<{
    request: typeof request
    state: bytemd.RenderState
  }>()
  const syncResult = useMemo(() => {
    if (renderer) return
    try {
      return bytemd.renderMarkdown(request)
    } catch (err) {
      console.error(err)
    }
  }, [request, renderer])
  useEffect(() => {
    if (!renderer) return
    const controller = bytemd.createRenderController((state) => {
      if (state.status === 'error') console.error(state.error)
      setAsyncState({ request, state })
    })
    controller.render(request, renderer)
    return () => controller.destroy()
  }, [request, renderer])
  const state = asyncState?.request === request ? asyncState.state : undefined
  const pending = !!renderer && (!state || state.status === 'pending')
  const file = renderer
    ? state?.status === 'ready'
      ? state.result.file
      : undefined
    : syncResult?.file

  useEffect(() => {
    const markdownBody = elRef.current
    if (!markdownBody || !file) return

    bytemd.addCopyButtons(markdownBody, locale)

    return bytemd.runViewerEffects(markdownBody, file, plugins, locale)
  }, [file, plugins, locale])

  return (
    <div
      onClick={(e) => {
        const $ = e.target as HTMLElement
        if ($.classList?.contains('bytemd-copy-btn')) {
          bytemd.copyCodeFromButton($ as HTMLButtonElement)
          return
        }
        if (elRef.current) bytemd.scrollToAnchor(elRef.current, e.nativeEvent)
      }}
      ref={elRef}
      className="markdown-body"
      aria-busy={pending}
      dangerouslySetInnerHTML={file ? { __html: file.toString() } : undefined}
    >
      {file ? undefined : pending ? (
        <p role="status" className="bytemd-render-pending">
          {locale?.renderPending ?? 'Rendering preview…'}
        </p>
      ) : (
        <p role="alert" className="bytemd-render-error">
          {locale?.renderError ?? 'Preview could not be rendered.'}
        </p>
      )}
    </div>
  )
}
