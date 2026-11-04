import { rootDir } from '../scripts/utils.mjs'
import { BrowserLauncher } from './prod-perf-browser-launcher.mjs'
import { CDPClient, evalInPage, waitForPage } from './prod-perf-cdp-client.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer, preview } from 'vite'

// Usage: node audit/upgrade-ui-reproduce.mjs [evidence directory] [packed Svelte build directory]
const output = process.argv[2]
  ? path.resolve(rootDir, process.argv[2])
  : await fs.mkdtemp(path.join(rootDir, 'audit/prod-perf-upgrade-ui-'))
const consumerBuild = process.argv[3]
  ? path.resolve(rootDir, process.argv[3])
  : undefined
for (const directory of [output, consumerBuild].filter(Boolean)) {
  const relative = path.relative(path.join(rootDir, 'audit'), directory)
  assert.ok(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    'Evidence must stay inside audit/',
  )
}
await fs.mkdir(output, { recursive: true })
const url = 'http://127.0.0.1:5196/audit/upgrade-ui.html'
const server = await createServer({
  configFile: false,
  root: rootDir,
  server: { host: '127.0.0.1', port: 5196, strictPort: true },
})
const evidence = {
  errors: [],
  manualIME: 'incomplete',
  realMobileDevice: 'incomplete',
}
let browser, session, consumerServer
try {
  await server.listen()
  browser = await new BrowserLauncher().launch({
    debugPort: 9396,
    headless: true,
    url,
  })
  session = await new CDPClient().connect(9396, url)
  session.on('Runtime.exceptionThrown', (event) =>
    evidence.errors.push(event.exceptionDetails),
  )
  await session.send('Runtime.enable')
  const evaluate = (body) => evalInPage(session, body)
  const waitFor = (body) => waitForPage(session, `(() => { ${body} })()`, 10000)
  const pause = () => new Promise((resolve) => setTimeout(resolve, 100))
  const key = async (code) => {
    const enter = code === 'Enter'
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: enter ? 'Enter' : ' ',
      code,
      windowsVirtualKeyCode: enter ? 13 : 32,
      text: enter ? '\r' : ' ',
      unmodifiedText: enter ? '\r' : ' ',
    })
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: enter ? 'Enter' : ' ',
      code,
      windowsVirtualKeyCode: enter ? 13 : 32,
    })
    await pause()
  }
  await waitFor(
    'return !!window.ready && !!document.querySelector(".bytemd-preview .markdown-body")',
  )
  await evaluate(
    'document.querySelector(".bytemd-toolbar-icon[aria-label=Tool]").click()',
  )
  await pause()
  await evaluate('document.querySelector(".bytemd-tool-toggle").focus()')
  await key('Enter')
  evidence.enterExpanded = await evaluate(
    'return document.querySelector(".bytemd-tool-toggle").getAttribute("aria-expanded")',
  )
  assert.equal(evidence.enterExpanded, 'true')
  await key('Space')
  evidence.spaceCollapsed = await evaluate(
    'return document.querySelector(".bytemd-tool-toggle").getAttribute("aria-expanded")',
  )
  assert.equal(evidence.spaceCollapsed, 'false')
  await evaluate('document.querySelector(".bytemd-tool-toggle").click()')
  await pause()
  await evaluate(
    'const row=[...document.querySelectorAll(".bytemd-tool-item")].find(row=>row.querySelector(".bytemd-help-title")?.textContent==="Probe insert"); row.querySelector(".bytemd-tool-use").focus()',
  )
  await key('Enter')
  evidence.keyboardUses = await evaluate('return window.actionCalls')
  assert.equal(evidence.keyboardUses, 1)
  await evaluate(
    'document.querySelector(".bytemd-toolbar-icon[aria-label=Tool]").click()',
  )
  await pause()
  await evaluate(
    'const row=[...document.querySelectorAll(".bytemd-tool-item")].find(row=>row.querySelector(".bytemd-help-title")?.textContent==="Probe insert"); row.querySelector(".bytemd-tool-use").click()',
  )
  await pause()
  evidence.submissions = await evaluate('return window.submissions')
  evidence.totalUses = await evaluate('return window.actionCalls')
  assert.equal(evidence.submissions, 0)
  assert.equal(evidence.totalUses, 2)

  const colors =
    'const element=document.querySelector(".bytemd-preview .markdown-body"); const css=getComputedStyle(element); return {color:css.color,surface:css.getPropertyValue("--md-surface").trim()}'
  await evaluate('document.documentElement.classList.add("dark")')
  evidence.darkBase = await evaluate(colors)
  await evaluate(
    'document.querySelector(".bytemd-preview .markdown-body").dataset.bytemdTheme="daylight"',
  )
  evidence.darkWithDaylight = await evaluate(colors)
  assert.deepEqual(evidence.darkWithDaylight, evidence.darkBase)
  await evaluate('document.documentElement.classList.remove("dark")')
  evidence.lightDaylight = await evaluate(colors)
  assert.equal(evidence.lightDaylight.surface, '#ffffff')
  await evaluate(
    'document.querySelector(".bytemd-preview .markdown-body").dataset.bytemdTheme="ink"',
  )
  evidence.standaloneInk = await evaluate(colors)
  assert.equal(evidence.standaloneInk.surface, '#0d1117')

  await evaluate('window.instance.$set({mode:"split"})')
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await pause()
  await evaluate('document.querySelectorAll(".bytemd-toolbar-tab")[1].click()')
  await pause()
  await evaluate('document.querySelectorAll(".bytemd-toolbar-tab")[1].click()')
  await pause()
  evidence.narrow = await evaluate(
    'return {active:document.querySelector(".bytemd").classList.contains("bytemd-narrow"),previewSelected:document.querySelectorAll(".bytemd-toolbar-tab")[1].getAttribute("aria-selected"),previewVisible:getComputedStyle(document.querySelector(".bytemd-preview")).display!=="none"}',
  )
  assert.deepEqual(evidence.narrow, {
    active: true,
    previewSelected: 'true',
    previewVisible: true,
  })
  await evaluate('window.instance.$destroy()')
  await pause()
  evidence.resizeAfterDestroy = await evaluate(
    'return window.resizeListeners.size',
  )
  await evaluate('window.mountEditor()')
  await pause()
  await evaluate('window.instance.$destroy()')
  await pause()
  evidence.resizeAfterTwoCycles = await evaluate(
    'return window.resizeListeners.size',
  )
  assert.equal(evidence.resizeAfterDestroy, 0)
  assert.equal(evidence.resizeAfterTwoCycles, 0)

  if (consumerBuild) {
    consumerServer = await preview({
      configFile: false,
      root: rootDir,
      build: { outDir: consumerBuild },
      preview: { host: '127.0.0.1', port: 5197, strictPort: true },
    })
    await session.send('Page.enable')
    await session.send('Emulation.clearDeviceMetricsOverride')
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off()
        reject(new Error('Consumer navigation timed out'))
      }, 10000)
      const off = session.on('Page.loadEventFired', () => {
        clearTimeout(timer)
        off()
        resolve()
      })
    })
    await session.send('Page.navigate', { url: 'http://127.0.0.1:5197/' })
    await loaded
    await waitFor(
      'return !!document.querySelector(".CodeMirror") && [...document.querySelectorAll(".markdown-body h1")].some(node=>node.textContent==="Svelte consumer")',
    )
    await evaluate(
      'document.querySelector(".CodeMirror").CodeMirror.setValue("# Updated packed Svelte")',
    )
    await waitFor(
      'return [...document.querySelectorAll(".markdown-body h1")].filter(node=>node.textContent==="Updated packed Svelte").length===2',
    )
    evidence.packedSvelteHost = { mounted: true, changeAndPreview: true }
  } else
    evidence.packedSvelteHost = {
      status: 'skipped',
      reason: 'No consumer build supplied',
    }
  assert.deepEqual(evidence.errors, [])
  await fs.writeFile(
    path.join(output, 'upgrade-ui-results.json'),
    JSON.stringify(evidence, null, 2),
  )
  console.log(JSON.stringify({ output, ...evidence }, null, 2))
} finally {
  await session?.disconnect()
  await browser?.close()
  await server.close()
  await new Promise((resolve) =>
    consumerServer ? consumerServer.httpServer.close(resolve) : resolve(),
  )
}
