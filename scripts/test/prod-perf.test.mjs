import { EvidenceArchiver } from '../../audit/prod-perf-archiver.mjs'
import {
  CDPClient,
  CDPConnectionError,
  CDPSession,
} from '../../audit/prod-perf-cdp-client.mjs'
import { cliOptions } from '../../audit/prod-perf-reproduce.mjs'
import {
  evalInPage,
  withPageEvent,
  validateSample,
  heapNodeSummary,
} from '../../audit/prod-perf-sample.mjs'
import { summarize } from '../../audit/prod-perf-summarize.mjs'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { test } from 'node:test'

test('CDP discovery actually sends its HTTP request and filters the requested page', async () => {
  const server = createServer((request, response) => {
    assert.equal(request.url, '/json/list')
    response.end(
      JSON.stringify([
        {
          type: 'page',
          url: 'http://unrelated/',
          webSocketDebuggerUrl: 'ws://wrong',
        },
        {
          type: 'page',
          url: 'http://fixture/',
          webSocketDebuggerUrl: 'ws://fixture',
        },
      ]),
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const original = globalThis.WebSocket
  let connected
  globalThis.WebSocket = class extends EventTarget {
    constructor(url) {
      super()
      connected = url
      queueMicrotask(() => this.dispatchEvent(new Event('open')))
    }
    close() {
      this.dispatchEvent(new Event('close'))
    }
  }
  try {
    const session = await new CDPClient().connect(
      server.address().port,
      'http://fixture/',
    )
    assert.equal(connected, 'ws://fixture')
    await session.disconnect()
  } finally {
    globalThis.WebSocket = original
    await new Promise((resolve) => server.close(resolve))
  }
})

test('action events are subscribed before synchronous page emissions', async () => {
  const events = new EventEmitter()
  const session = {
    on(name, fn) {
      events.on(name, fn)
      return () => events.off(name, fn)
    },
  }
  const result = await withPageEvent(session, 'armed', async () => {
    events.emit('Runtime.consoleAPICalled', {
      args: [{ value: '__PROD_PERF_RESULT__:{"type":"armed"}' }],
    })
  })
  assert.equal(result.type, 'armed')
  assert.equal(events.listenerCount('Runtime.consoleAPICalled'), 0)
})

test('page evaluation reports runtime exceptions instead of undefined success', async () => {
  const session = {
    async send() {
      return {
        exceptionDetails: { exception: { description: 'Missing selector' } },
      }
    },
  }
  await assert.rejects(evalInPage(session, 'return 1'), /Missing selector/)
})

test('CDP ignores late replies after timeout and clears pending jobs on disconnect', async () => {
  const events = new EventEmitter()
  let sends = 0
  const ws = {
    addEventListener(name, fn) {
      events.on(name, fn)
    },
    send() {
      sends++
    },
    close() {},
  }
  const session = new CDPSession(ws)
  await assert.rejects(session.send('slow', {}, 5), /Timeout/)
  assert.doesNotThrow(() =>
    events.emit('message', { data: '{"id":1,"result":{}}' }),
  )
  const pending = session.send('pending')
  const rejected = assert.rejects(pending, CDPConnectionError)
  await session.disconnect()
  await rejected
  await assert.rejects(
    session.send('after-disconnect', {}, 5),
    CDPConnectionError,
  )
  assert.equal(sends, 2)
  assert.equal(session._pending.size, 0)
})

test('CDP synchronous send failures clear the request and its timer', async (t) => {
  const failure = new Error('socket send failed')
  const session = new CDPSession({
    addEventListener() {},
    send() {
      throw failure
    },
    close() {},
  })
  t.after(() => session.disconnect())
  const clearTimer = t.mock.method(globalThis, 'clearTimeout')
  await assert.rejects(
    session.send('Runtime.enable'),
    (error) => error === failure,
  )
  assert.equal(session._pending.size, 0)
  assert.equal(clearTimer.mock.callCount(), 1)
})

test('CDP remote close rejects pending and subsequent requests without sending', async () => {
  const events = new EventEmitter()
  let sends = 0
  const session = new CDPSession({
    addEventListener(name, fn) {
      events.on(name, fn)
    },
    send() {
      sends++
    },
    close() {},
  })
  const rejected = assert.rejects(session.send('pending'), CDPConnectionError)
  events.emit('close')
  await rejected
  await assert.rejects(session.send('after-close', {}, 5), CDPConnectionError)
  assert.equal(sends, 1)
  assert.equal(session._pending.size, 0)
})

test('valid sample counts require every key, current preview and fixed visible viewport', () => {
  const environment = { visibilityState: 'visible', viewport: [1280, 800] }
  const sample = {
    keyCount: 5,
    valueMatchesPreview: true,
    firstLine: 'aaaaa# Long document',
    environment,
    active: environment,
  }
  validateSample(sample, 5)
  assert.throws(
    () => validateSample({ ...sample, keyCount: 1 }, 5),
    /Lost keys/,
  )
  assert.throws(
    () => validateSample({ ...sample, valueMatchesPreview: false }, 5),
    /stale preview/,
  )
  assert.throws(
    () =>
      validateSample(
        { ...sample, active: { ...environment, visibilityState: 'hidden' } },
        5,
      ),
    /hidden/,
  )
})

test('snapshot node summaries use metadata field offsets and real counts', () => {
  const heap = {
    snapshot: {
      meta: {
        node_fields: ['name', 'type', 'self_size'],
        node_types: [[], ['object', 'native'], []],
      },
    },
    nodes: [0, 0, 10, 1, 1, 20, 1, 1, 20],
    strings: ['CodeMirror', 'HTMLDivElement'],
  }
  assert.deepEqual(heapNodeSummary(Buffer.from(JSON.stringify(heap))), {
    nodeCount: 3,
    selfSize: 50,
    counts: { object: 1, native: 2 },
    named: { CodeMirror: 1, HTMLDivElement: 2 },
  })
})

test('evidence archiving rejects collisions on repeated runs without replacing bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bytemd-prod-perf-test-'))
  try {
    const archive = new EvidenceArchiver(dir)
    await archive.archive('first', 'prod-perf-sample.json')
    await assert.rejects(
      archive.archive('second', 'prod-perf-sample.json'),
      /already exists/,
    )
    await assert.rejects(
      new EvidenceArchiver(dir).archive('third', 'prod-perf-sample.json'),
      /already exists/,
    )
    assert.equal(
      readFileSync(join(dir, 'prod-perf-sample.json'), 'utf8'),
      'first',
    )
  } finally {
    assert.ok(
      resolve(dir).startsWith(resolve(tmpdir()) + sep) &&
        dir.split(sep).at(-1).startsWith('bytemd-prod-perf-test-'),
    )
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reproduction CLI resolves portable options and rejects unknown flags', () => {
  const options = cliOptions([
    '--skip-build',
    '--sizes=10,100',
    '--samples=3',
    '--memory-loops=2',
  ])
  assert.deepEqual(options, {
    skipBuild: true,
    sizes: [10, 100],
    samples: 3,
    memoryLoops: 2,
  })
  assert.throws(() => cliOptions(['--bogus']), /Unknown/)
  assert.throws(() => cliOptions(['--samples=0']), /Invalid/)
  assert.throws(() => cliOptions(['--sizes=999']), /Invalid/)
})

test('comparison summaries retain custom sizes and only report measured groups', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bytemd-prod-perf-test-'))
  try {
    const archive = new EvidenceArchiver(dir)
    await archive.archive(
      JSON.stringify({
        errors: [],
        comparison: [
          {
            size: 10,
            profile: 'core',
            variant: 'baseline',
            sample: { firstFrameMs: 11, totalMs: 20 },
          },
          {
            size: 100,
            profile: 'enhanced',
            variant: 'body-size',
            sample: { firstFrameMs: 9, totalMs: 40 },
          },
          {
            size: 10,
            profile: 'core',
            variant: 'baseline',
            sample: { firstFrameMs: 15, totalMs: 30 },
          },
        ],
      }),
      'prod-perf-summary.json',
    )
    assert.deepEqual(summarize(dir).comparison, [
      {
        size: 10,
        profile: 'core',
        variant: 'baseline',
        firstFrameMs: { n: 2, min: 11, median: 13, max: 15 },
        totalMs: { n: 2, min: 20, median: 25, max: 30 },
      },
      {
        size: 100,
        profile: 'enhanced',
        variant: 'body-size',
        firstFrameMs: { n: 1, min: 9, median: 9, max: 9 },
        totalMs: { n: 1, min: 40, median: 40, max: 40 },
      },
    ])
  } finally {
    assert.ok(
      resolve(dir).startsWith(resolve(tmpdir()) + sep) &&
        dir.split(sep).at(-1).startsWith('bytemd-prod-perf-test-'),
    )
    rmSync(dir, { recursive: true, force: true })
  }
})
