import { CDPClient } from './prod-perf-cdp-client.mjs'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

export class PortInUseError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PortInUseError'
  }
}
export class BrowserNotFoundError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BrowserNotFoundError'
  }
}

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

function findChrome() {
  for (const p of CHROME_PATHS) if (p && existsSync(p)) return p
  return null
}

export class BrowserLauncher {
  async launch(options) {
    const { debugPort, headless, url, browserPath } = options
    const chromePath = browserPath || findChrome()
    if (!chromePath) throw new BrowserNotFoundError('Chrome not found')
    try {
      await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      throw new PortInUseError(`Debug port ${debugPort} already in use`)
    } catch (error) {
      if (error instanceof PortInUseError) throw error
    }
    const profile = mkdtempSync(join(tmpdir(), 'bytemd-prod-perf-'))
    const args = [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--window-size=1280,900',
      headless ? '--headless=new' : '',
      url || 'about:blank',
    ].filter(Boolean)
    const proc = spawn(chromePath, args, { stdio: 'ignore' })
    let spawnError
    proc.on('error', (error) => {
      spawnError = error
    })
    const handle = new BrowserHandle(proc, debugPort, profile)
    try {
      const deadline = Date.now() + 30000
      while (Date.now() < deadline) {
        if (spawnError) throw spawnError
        try {
          const targets = await (
            await fetch(`http://127.0.0.1:${debugPort}/json/list`)
          ).json()
          if (
            targets.some(
              (target) => target.type === 'page' && target.url.startsWith(url),
            )
          )
            return handle
        } catch {}
        await new Promise((r) => setTimeout(r, 250))
      }
      throw new Error('Chrome debug endpoint did not become ready')
    } catch (error) {
      await handle.close()
      throw error
    }
  }

  async connectExisting(debugPort) {
    return new BrowserHandle(null, debugPort)
  }
}

export class BrowserHandle {
  constructor(proc, debugPort, profile) {
    this.pid = proc?.pid ?? 0
    this.debugPort = debugPort
    this._proc = proc
    this._profile = profile
  }

  async close() {
    if (!this._proc) return
    try {
      const session = await new CDPClient().connect(this.debugPort)
      await session.send('Browser.close', {}, 5000)
      await session.disconnect()
    } catch {}
    this._proc.kill()
    if (
      this._profile &&
      resolve(this._profile).startsWith(resolve(tmpdir()) + sep) &&
      this._profile.split(sep).at(-1).startsWith('bytemd-prod-perf-')
    ) {
      try {
        rmSync(this._profile, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 250,
        })
      } catch {}
    }
  }
}
