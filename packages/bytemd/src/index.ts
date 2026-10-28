import './index.scss'

export * from './types'
export type {
  BytemdRenderer,
  RenderOptions,
  RenderResult,
  RenderState,
  JsonValue,
} from './render-types'
export { renderMarkdown } from './processor'
export { createRenderController } from './render-controller'
export { renderPendingHtml } from './render-feedback'
export { createWorkerRenderer } from './worker-renderer'
export type {
  WorkerRenderer,
  WorkerRendererOptions,
  RenderWorker,
} from './worker-renderer'
export { Editor, Viewer } from './legacy-compat'
export type {
  Editor as EditorInstance,
  Viewer as ViewerInstance,
} from './legacy-compat'
export { EditorComponent, ViewerComponent } from './legacy-compat'
export { runViewerEffects } from './viewer-effects'
export {
  addCopyButtons,
  copyCodeFromButton,
  getProcessor,
  scrollToAnchor,
  renderErrorHtml,
} from './utils'
