import { renderMarkdown } from './processor'
import type {
  BytemdRenderer,
  RenderOptions,
  RenderResult,
  JsonValue,
} from './render-types'
import { WORKER_PROTOCOL, isJsonValue, abortError } from './worker-protocol'
import type { WorkerResponse, WorkerRequest } from './worker-protocol'
import { VFile } from 'vfile'

export type RenderWorker = Pick<
  Worker,
  'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'
>
export interface WorkerRendererOptions {
  /** undefined selects the synchronous compatibility path. Represent every parser callback. */
  resolveOptions?(options: RenderOptions): JsonValue | undefined
  /** queue keeps the running parse; restart terminates it on active cancellation. */
  strategy?: 'queue' | 'restart'
  /** Startup and active-request timeout; 0 disables it. Default 60000ms. */
  timeoutMs?: number
}
export type WorkerRenderer = BytemdRenderer & { destroy(): void }

function defaultOptions(options: RenderOptions): JsonValue | undefined {
  if (
    options.sanitize ||
    options.plugins?.some((plugin) => plugin.remark || plugin.rehype)
  )
    return
  if (options.remarkRehype === undefined) return {}
  if (isJsonValue(options.remarkRehype))
    return { remarkRehype: options.remarkRehype }
}

/** Lazy, host-owned Worker. Sharing it does not discard another Viewer's queued requests. */
export function createWorkerRenderer(
  createWorker: () => RenderWorker,
  {
    resolveOptions = defaultOptions,
    strategy = 'queue',
    timeoutMs = 60000,
  }: WorkerRendererOptions = {},
): WorkerRenderer {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
    throw new Error('Invalid Worker timeout.')
  if (strategy !== 'queue' && strategy !== 'restart')
    throw new Error('Invalid Worker strategy.')
  type Job = {
    request: WorkerRequest
    input: RenderOptions
    started: number
    sent?: number
    resolve(result: RenderResult): void
    reject(error: unknown): void
    unsubscribe(): void
  }
  let worker: RenderWorker | undefined
  let ready = false
  let disposed = false
  let nextId = 0
  let startup = 0
  let startupMs = 0
  let current: Job | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const queue: Job[] = []
  const clearTimer = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const stopWorker = () => {
    clearTimer()
    worker?.removeEventListener('message', onMessage)
    worker?.removeEventListener('error', onError)
    worker?.removeEventListener('messageerror', onError)
    worker?.terminate()
    worker = undefined
    ready = false
  }
  const fail = (error: unknown) => {
    const job = current
    current = undefined
    stopWorker()
    if (job) {
      job.unsubscribe()
      job.reject(error)
    } else {
      for (const queued of queue.splice(0)) {
        queued.unsubscribe()
        queued.reject(error)
      }
    }
    pump()
  }
  const armTimer = () => {
    clearTimer()
    if (timeoutMs)
      timer = setTimeout(
        () => fail(new Error('Worker rendering timed out.')),
        timeoutMs,
      )
  }
  const onError: EventListener = (event) => {
    event.preventDefault()
    fail(
      (event as ErrorEvent).error ??
        new Error((event as ErrorEvent).message || 'Worker rendering failed.'),
    )
  }
  const onMessage: EventListener = (event) => {
    const response = (event as MessageEvent<WorkerResponse>).data
    if (response?.protocol !== WORKER_PROTOCOL) {
      fail(new Error('Invalid Worker protocol.'))
      return
    }
    if (response.type === 'ready') {
      if (!ready) {
        startupMs = performance.now() - startup
        ready = true
        clearTimer()
        pump()
      }
      return
    }
    const job = current
    if (!job || response.id !== job.request.id) return
    current = undefined
    clearTimer()
    job.unsubscribe()
    if (!job.input.signal?.aborted) {
      try {
        if (response.type === 'error') {
          const error = new Error(response.error.message)
          error.name = response.error.name
          error.stack = response.error.stack
          job.reject(error)
        } else {
          if (
            response.type !== 'result' ||
            response.value !== job.input.value ||
            typeof response.html !== 'string' ||
            response.hast?.type !== 'root' ||
            !Array.isArray(response.blocks)
          )
            throw new Error('Invalid Worker render result.')
          const file = new VFile({
            value: response.html,
            data: response.file.data,
            cwd: response.file.cwd,
          })
          file.history = response.file.history
          for (const message of response.file.messages)
            Object.assign(file.message(message.reason), message)
          job.resolve({
            value: response.value,
            file,
            hast: response.hast,
            blocks: response.blocks,
            mode: 'worker',
            timings: {
              renderMs: response.renderMs,
              queueMs: job.sent! - job.started,
              startupMs: job.started <= startup + startupMs ? startupMs : 0,
              totalMs: performance.now() - job.started,
            },
          })
        }
      } catch (error) {
        job.reject(error)
      }
    }
    pump()
  }
  function pump() {
    if (disposed || current || !queue.length) return
    if (!worker) {
      try {
        startup = performance.now()
        worker = createWorker()
        worker.addEventListener('message', onMessage)
        worker.addEventListener('error', onError)
        worker.addEventListener('messageerror', onError)
        armTimer()
      } catch (error) {
        fail(error)
      }
      return
    }
    if (!ready) return
    current = queue.shift()!
    current.sent = performance.now()
    armTimer()
    try {
      worker.postMessage(current.request)
    } catch (error) {
      fail(error)
    }
  }
  const renderer: BytemdRenderer = async (input) => {
    if (disposed || input.signal?.aborted) throw abortError()
    const options = resolveOptions(input)
    if (disposed || input.signal?.aborted) throw abortError()
    if (options === undefined) return renderMarkdown(input)
    if (!isJsonValue(options))
      throw new Error('Worker configuration must be serializable JSON.')
    const portable = JSON.parse(JSON.stringify(options)) as JsonValue
    if (disposed || input.signal?.aborted) throw abortError()
    return new Promise<RenderResult>((resolve, reject) => {
      const job: Job = {
        input,
        started: performance.now(),
        resolve,
        reject,
        request: {
          protocol: WORKER_PROTOCOL,
          type: 'render',
          id: ++nextId,
          value: input.value,
          version: input.version ?? nextId,
          sourceMap: !!input.sourceMap,
          options: portable,
        },
        unsubscribe() {},
      }
      const cancel = () => {
        job.unsubscribe()
        reject(abortError())
        const index = queue.indexOf(job)
        if (index >= 0) queue.splice(index, 1)
        if (current === job && strategy === 'restart') {
          current = undefined
          stopWorker()
          pump()
        }
      }
      input.signal?.addEventListener('abort', cancel, { once: true })
      job.unsubscribe = () => input.signal?.removeEventListener('abort', cancel)
      queue.push(job)
      if (disposed || input.signal?.aborted) cancel()
      else pump()
    })
  }
  return Object.assign(renderer, {
    destroy() {
      disposed = true
      stopWorker()
      if (current) {
        current.unsubscribe()
        current.reject(abortError())
        current = undefined
      }
      for (const job of queue.splice(0)) {
        job.unsubscribe()
        job.reject(abortError())
      }
    },
  })
}
