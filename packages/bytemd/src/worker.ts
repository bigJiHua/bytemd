import { renderMarkdown } from './processor'
import type { RenderOptions, JsonValue } from './render-types'
import { WORKER_PROTOCOL, isJsonValue } from './worker-protocol'
import type { WorkerRequest, WorkerResponse } from './worker-protocol'

export { getProcessor, renderMarkdown } from './processor'
export type { RenderOptions, RenderResult, JsonValue } from './render-types'
export type { WorkerRequest, WorkerResponse } from './worker-protocol'

export interface WorkerScope {
  postMessage(message: WorkerResponse): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void,
  ): void
}
export type WorkerConfiguration = (
  options: JsonValue,
) => Omit<RenderOptions, 'value' | 'sourceMap' | 'version' | 'signal'>

const defaultConfiguration: WorkerConfiguration = (options) => {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => key !== 'remarkRehype')
  )
    throw new Error(
      'The default Worker only accepts remarkRehype configuration.',
    )
  return { remarkRehype: options.remarkRehype as RenderOptions['remarkRehype'] }
}

/** Register trusted parser plugins here, inside the Worker rather than transferring functions. */
export function installWorkerRenderer(
  scope: WorkerScope,
  configure: WorkerConfiguration = defaultConfiguration,
) {
  let active = true
  const listener = (event: MessageEvent<WorkerRequest>) => {
    const request = event.data
    if (
      !active ||
      request?.protocol !== WORKER_PROTOCOL ||
      request.type !== 'render' ||
      !Number.isSafeInteger(request.id) ||
      request.id < 1
    )
      return
    try {
      if (
        typeof request.value !== 'string' ||
        !Number.isSafeInteger(request.version) ||
        typeof request.sourceMap !== 'boolean' ||
        !isJsonValue(request.options)
      )
        throw new Error('Invalid Worker render request.')
      const result = renderMarkdown({
        ...configure(request.options),
        value: request.value,
        version: request.version,
        sourceMap: request.sourceMap,
      })
      scope.postMessage({
        protocol: WORKER_PROTOCOL,
        type: 'result',
        id: request.id,
        value: result.value,
        html: result.file.toString(),
        hast: result.hast,
        blocks: result.blocks,
        renderMs: result.timings.renderMs,
        file: {
          data: result.file.data,
          cwd: result.file.cwd,
          history: result.file.history,
          messages: result.file.messages.map((message) => ({ ...message })),
        },
      })
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error))
      scope.postMessage({
        protocol: WORKER_PROTOCOL,
        type: 'error',
        id: request.id,
        error: { name: cause.name, message: cause.message, stack: cause.stack },
      })
    }
  }
  scope.addEventListener('message', listener)
  scope.postMessage({ protocol: WORKER_PROTOCOL, type: 'ready' })
  return () => {
    active = false
    scope.removeEventListener('message', listener)
  }
}
