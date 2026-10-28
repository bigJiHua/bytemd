import type { SourceBlock } from './source-blocks'
import type { ViewerProps } from './types'
import type { Root } from 'hast'
import type { VFile } from 'vfile'

export type RenderOptions = Pick<
  ViewerProps,
  'value' | 'plugins' | 'sanitize' | 'remarkRehype' | 'headingIds'
> & {
  sourceMap?: boolean
  version?: number
  signal?: AbortSignal
}

export interface RenderResult {
  value: string
  file: VFile
  hast: Root
  blocks: SourceBlock[]
  mode: 'sync' | 'worker'
  timings: {
    renderMs: number
    queueMs?: number
    startupMs?: number
    totalMs?: number
  }
}

/** A host may supply an asynchronous renderer; DOM effects remain in the Viewer. */
export type BytemdRenderer = (options: RenderOptions) => Promise<RenderResult>

export type RenderState =
  | { status: 'pending'; value: string }
  | { status: 'ready'; result: RenderResult }
  | { status: 'error'; value: string; error: unknown }

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [key: string]: JsonValue
    }
