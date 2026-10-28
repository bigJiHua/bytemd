import { renderMarkdown } from '../src/processor'
import { installWorkerRenderer } from '../src/worker'
import type { WorkerConfiguration } from '../src/worker'
import { createWorkerRenderer } from '../src/worker-renderer'
import type { RenderWorker } from '../src/worker-renderer'

class Bridge extends EventTarget {
  active = true
  hold = false
  requests: any[] = []
  listener?: (event: MessageEvent) => void
  constructor(configure?: WorkerConfiguration) {
    super()
    installWorkerRenderer(
      {
        postMessage: (response) => {
          const data = structuredClone(response)
          queueMicrotask(() => {
            if (this.active)
              this.dispatchEvent(new MessageEvent('message', { data }))
          })
        },
        addEventListener: (_, listener) => {
          this.listener = listener
        },
        removeEventListener: () => {
          this.listener = undefined
        },
      },
      configure,
    )
  }
  postMessage(request: any) {
    this.requests.push(structuredClone(request))
    if (!this.hold) queueMicrotask(() => this.flush())
  }
  flush() {
    const request = this.requests.shift()
    if (request && this.active)
      this.listener?.(new MessageEvent('message', { data: request }))
  }
  terminate() {
    this.active = false
  }
}
const renderers: ReturnType<typeof createWorkerRenderer>[] = []
const make = (
  factory: () => Bridge,
  options?: Parameters<typeof createWorkerRenderer>[1],
) => {
  const renderer = createWorkerRenderer(factory as () => RenderWorker, options)
  renderers.push(renderer)
  return renderer
}
afterEach(() => {
  renderers.splice(0).forEach((renderer) => renderer.destroy())
  vi.useRealTimers()
})
const microtasks = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

test('Worker round-trip preserves HTML, source blocks, VFile data and messages', async () => {
  const renderer = make(
    () =>
      new Bridge(() => ({
        plugins: [
          {
            rehype: (p) =>
              p.use(() => (_, file) => {
                file.data.marker = 'kept'
                file.message('warning')
              }),
          },
        ],
      })),
  )
  const result = await renderer({
    value: '# title\n\n[color=#f00]red[/color]',
    sourceMap: true,
    version: 9,
  })
  expect(result.mode).toBe('worker')
  expect(result.file.toString()).toContain('data-bytemd-block="9-0"')
  expect(result.file.toString()).toContain('color:#f00')
  expect(result.blocks[0]).toMatchObject({ id: '9-0', line: 0 })
  expect(result.file.data.marker).toBe('kept')
  expect(result.file.messages[0].toString()).toContain('warning')
  expect(result.timings.renderMs).toBeGreaterThanOrEqual(0)
})

test('unknown parser callbacks use synchronous compatibility without creating a Worker', async () => {
  const factory = vi.fn(() => new Bridge())
  const renderer = make(factory)
  const inputs = [
    {
      value: 'text',
      plugins: [
        {
          remark: (p: any) =>
            p.use(() => (tree: any) => {
              tree.children[0].children[0].value = 'remark preserved'
            }),
        },
      ],
    },
    {
      value: 'text',
      sanitize: (schema: any) => {
        schema.tagNames = []
        return schema
      },
    },
    {
      value: 'text',
      remarkRehype: {
        handlers: {
          text: () => ({ type: 'text' as const, value: 'handler preserved' }),
        },
      },
    },
  ]
  for (const input of inputs) {
    const result = await renderer(input)
    expect(result.mode).toBe('sync')
    expect(result.file.toString()).toBe(renderMarkdown(input).file.toString())
  }
  expect(factory).not.toHaveBeenCalled()
})

test('explicit registry mapping keeps parser configuration inside the Worker', async () => {
  const callback = (p: any) => p
  const factory = vi.fn(
    () =>
      new Bridge((options: any) => ({
        plugins: [
          {
            remark: (p) =>
              p.use(() => (tree: any) => {
                tree.children[0].children[0].value = options.label
              }),
          },
        ],
      })),
  )
  const renderer = make(factory, {
    resolveOptions: (input) =>
      input.plugins?.[0].remark === callback
        ? { label: 'registered' }
        : undefined,
  })
  const result = await renderer({
    value: 'text',
    plugins: [{ remark: callback }],
  })
  expect(result.mode).toBe('worker')
  expect(result.file.toString()).toContain('registered')
})

test('queue cancellation drops old pending work and preserves another Viewer', async () => {
  const bridge = new Bridge()
  bridge.hold = true
  const renderer = make(() => bridge)
  const active = new AbortController()
  const queued = new AbortController()
  const a = renderer({ value: '# first', signal: active.signal }).catch(
    (error) => error.name,
  )
  const stale = renderer({ value: '# stale', signal: queued.signal }).catch(
    (error) => error.name,
  )
  const peer = renderer({ value: '# peer' })
  await microtasks()
  active.abort()
  queued.abort()
  expect(await a).toBe('AbortError')
  expect(await stale).toBe('AbortError')
  expect(bridge.requests).toHaveLength(1)
  bridge.flush()
  await microtasks()
  expect(bridge.requests).toHaveLength(1)
  expect(bridge.requests[0].value).toBe('# peer')
  bridge.flush()
  expect((await peer).file.toString()).toContain('peer')
})

test('restart cancellation terminates the old Worker and carries queued work forward', async () => {
  const bridges: Bridge[] = []
  const renderer = make(
    () => {
      const b = new Bridge()
      b.hold = true
      bridges.push(b)
      return b
    },
    { strategy: 'restart' },
  )
  const abort = new AbortController()
  const old = renderer({ value: '# old', signal: abort.signal }).catch(
    (e) => e.name,
  )
  const fresh = renderer({ value: '# fresh' })
  await microtasks()
  abort.abort()
  await microtasks()
  expect(await old).toBe('AbortError')
  expect(bridges[0].active).toBe(false)
  bridges[1].flush()
  expect((await fresh).file.toString()).toContain('fresh')
})

test('failed Worker creation and non-serializable registry values reject explicitly', async () => {
  const failed = make(() => {
    throw new Error('startup failed')
  })
  await expect(failed({ value: 'text' })).rejects.toThrow('startup failed')
  const factory = vi.fn(() => new Bridge())
  const renderer = make(factory, {
    resolveOptions: () => ({ callback: () => {} }) as any,
  })
  await expect(renderer({ value: 'text' })).rejects.toThrow('serializable JSON')
  expect(factory).not.toHaveBeenCalled()
})

test('non-cloneable plugin metadata becomes a render error rather than being dropped', async () => {
  const renderer = make(
    () =>
      new Bridge(() => ({
        plugins: [
          {
            rehype: (p) =>
              p.use(() => (_, file) => {
                file.data.callback = () => {}
              }),
          },
        ],
      })),
  )
  await expect(renderer({ value: 'text' })).rejects.toThrow()
})

test('startup timeout terminates the Worker and allows a later retry', async () => {
  vi.useFakeTimers()
  const unready = new Bridge()
  unready.active = false
  let calls = 0
  const renderer = make(() => (++calls === 1 ? unready : new Bridge()), {
    timeoutMs: 20,
  })
  const promise = renderer({ value: '# timeout' }).catch((e) => e.message)
  await vi.advanceTimersByTimeAsync(20)
  expect(await promise).toContain('timed out')
  expect((await renderer({ value: '# retry' })).mode).toBe('worker')
})

test('active timeout rejects the stalled job and restarts queued peer work', async () => {
  vi.useFakeTimers()
  const stalled = new Bridge()
  stalled.hold = true
  let calls = 0
  const renderer = make(() => (++calls === 1 ? stalled : new Bridge()), {
    timeoutMs: 20,
  })
  const old = renderer({ value: '# stalled' }).catch((e) => e.message)
  const peer = renderer({ value: '# peer' })
  await microtasks()
  expect(stalled.requests).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(20)
  expect(await old).toContain('timed out')
  expect(stalled.active).toBe(false)
  expect((await peer).file.toString()).toContain('peer')
})

test.each(['error', 'messageerror'])(
  'Worker %s fails the active request while queued work recovers',
  async (type) => {
    const failed = new Bridge()
    failed.hold = true
    let calls = 0
    const renderer = make(() => (++calls === 1 ? failed : new Bridge()))
    const old = renderer({ value: '# old' }).catch((e) => e.message)
    const peer = renderer({ value: '# peer' })
    await microtasks()
    failed.dispatchEvent(new Event(type, { cancelable: true }))
    expect(await old).toContain('Worker rendering failed')
    expect(failed.active).toBe(false)
    expect((await peer).file.toString()).toContain('peer')
  },
)

test('host destroy aborts active and queued requests and forbids new work', async () => {
  const bridge = new Bridge()
  bridge.hold = true
  const renderer = make(() => bridge)
  const old = renderer({ value: '# old' }).catch((e) => e.name)
  const peer = renderer({ value: '# peer' }).catch((e) => e.name)
  await microtasks()
  renderer.destroy()
  expect(await old).toBe('AbortError')
  expect(await peer).toBe('AbortError')
  expect(bridge.active).toBe(false)
  bridge.flush()
  await expect(renderer({ value: '# new' })).rejects.toMatchObject({
    name: 'AbortError',
  })
})

test.each([{}, undefined])(
  'cancellation during configuration rejects before either rendering path: %j',
  async (options) => {
    const abort = new AbortController()
    const factory = vi.fn(() => new Bridge())
    const renderer = make(factory, {
      resolveOptions() {
        abort.abort()
        return options
      },
    })
    await expect(
      renderer({ value: 'text', signal: abort.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(factory).not.toHaveBeenCalled()
  },
)

test.each([{}, undefined])(
  'host destruction during configuration rejects before either rendering path: %j',
  async (options) => {
    const factory = vi.fn(() => new Bridge())
    const renderer = make(factory, {
      resolveOptions() {
        renderer.destroy()
        return options
      },
    })
    await expect(renderer({ value: 'text' })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(factory).not.toHaveBeenCalled()
  },
)

test('cancellation during configuration serialization rejects without starting a Worker', async () => {
  const abort = new AbortController()
  const factory = vi.fn(() => new Bridge())
  let reads = 0
  const renderer = make(factory, {
    resolveOptions: () => ({
      get label() {
        // Validation reads it first; JSON serialization can invoke getters again.
        if (++reads === 2) abort.abort()
        return 'text'
      },
    }),
  })
  await expect(
    renderer({ value: 'text', signal: abort.signal }),
  ).rejects.toMatchObject({
    name: 'AbortError',
  })
  expect(factory).not.toHaveBeenCalled()
})

test('Worker configuration accepts shared acyclic objects but rejects actual cycles', async () => {
  const shared = { label: 'shared' }
  const options: any = { a: shared, b: [shared] }
  const factory = vi.fn(() => new Bridge(() => ({})))
  const renderer = make(factory, { resolveOptions: () => options })
  expect((await renderer({ value: 'text' })).mode).toBe('worker')
  options.back = options
  await expect(renderer({ value: 'text' })).rejects.toThrow('serializable JSON')
  expect(factory).toHaveBeenCalledTimes(1)
})
