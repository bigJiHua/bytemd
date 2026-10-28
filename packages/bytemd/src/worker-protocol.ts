import type { JsonValue, RenderResult } from './render-types'

export const WORKER_PROTOCOL = 1
export interface WorkerRequest {
  protocol: 1
  type: 'render'
  id: number
  value: string
  version: number
  sourceMap: boolean
  options: JsonValue
}
export type WorkerResponse =
  | { protocol: 1; type: 'ready' }
  | {
      protocol: 1
      type: 'error'
      id: number
      error: { name: string; message: string; stack?: string }
    }
  | {
      protocol: 1
      type: 'result'
      id: number
      value: string
      html: string
      hast: RenderResult['hast']
      blocks: RenderResult['blocks']
      renderMs: number
      file: {
        data: RenderResult['file']['data']
        cwd: string
        history: string[]
        messages: Record<string, any>[]
      }
    }

/** JSON configuration only; functions, special objects and cycles are explicit failures. */
export function isJsonValue(value: unknown): value is JsonValue {
  const pending: { value: unknown; leave?: boolean }[] = [{ value }]
  const ancestors = new Set<object>()
  const checked = new Set<object>()
  while (pending.length) {
    const { value: item, leave } = pending.pop()!
    if (leave) {
      ancestors.delete(item as object)
      checked.add(item as object)
      continue
    }
    if (item === null || typeof item === 'string' || typeof item === 'boolean')
      continue
    if (typeof item === 'number' && Number.isFinite(item)) continue
    if (typeof item !== 'object' || !item || ancestors.has(item)) return false
    if (checked.has(item)) continue
    ancestors.add(item)
    pending.push({ value: item, leave: true })
    if (Array.isArray(item)) {
      for (const child of item) pending.push({ value: child })
    } else {
      const proto = Object.getPrototypeOf(item)
      if (proto !== Object.prototype && proto !== null) return false
      for (const child of Object.values(item)) pending.push({ value: child })
    }
  }
  return true
}

export function abortError() {
  const error = new Error('Rendering was cancelled.')
  error.name = 'AbortError'
  return error
}
