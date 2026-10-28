import { get } from 'node:http'

export class CDPConnectionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CDPConnectionError'
  }
}
export class CDPTimeoutError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CDPTimeoutError'
  }
}
export class CDPProtocolError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'CDPProtocolError'
    this.code = code
  }
}

async function getWsUrl(debugPort, pageUrl) {
  return new Promise((resolve, reject) => {
    const req = get(
      { host: '127.0.0.1', port: debugPort, path: '/json/list', timeout: 5000 },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const targets = JSON.parse(data)
            const page = targets.find(
              (t) =>
                t.type === 'page' && (!pageUrl || t.url.startsWith(pageUrl)),
            )
            if (page?.webSocketDebuggerUrl) resolve(page.webSocketDebuggerUrl)
            else reject(new CDPConnectionError('No page target found'))
          } catch {
            reject(new CDPConnectionError('Failed to parse /json/list'))
          }
        })
      },
    ).on('error', reject)
    req.on('timeout', () =>
      req.destroy(new CDPConnectionError('Debug endpoint request timed out')),
    )
  })
}

export class CDPClient {
  async connect(debugPort, pageUrl) {
    const wsUrl = await getWsUrl(debugPort, pageUrl)
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    return new CDPSession(ws)
  }
}

export class CDPSession {
  constructor(ws) {
    this._ws = ws
    this._id = 0
    this._closed = false
    this._pending = new Map()
    this._listeners = new Map()
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== undefined) {
        const pending = this._pending.get(msg.id)
        if (!pending) return
        const { resolve, reject } = pending
        this._pending.delete(msg.id)
        if (msg.error)
          reject(new CDPProtocolError(msg.error.message, msg.error.code))
        else resolve(msg.result)
      } else if (msg.method) {
        const handlers = this._listeners.get(msg.method)
        if (handlers) handlers.forEach((h) => h(msg.params))
      }
    })
    ws.addEventListener('close', () => this._handleClose())
  }

  _handleClose() {
    this._closed = true
    for (const pending of this._pending.values())
      pending.reject(new CDPConnectionError('CDP connection closed'))
    this._pending.clear()
  }

  send(method, params, timeoutMs = 180000) {
    if (this._closed)
      return Promise.reject(new CDPConnectionError('CDP connection closed'))
    const id = ++this._id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id)
        reject(new CDPTimeoutError(`Timeout: ${method}`))
      }, timeoutMs)
      this._pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      try {
        this._ws.send(JSON.stringify({ id, method, params: params || {} }))
      } catch (error) {
        clearTimeout(timer)
        this._pending.delete(id)
        reject(error)
      }
    })
  }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set())
    this._listeners.get(event).add(handler)
    return () => this._listeners.get(event)?.delete(handler)
  }

  async disconnect() {
    this._handleClose()
    this._ws.close()
  }
}
