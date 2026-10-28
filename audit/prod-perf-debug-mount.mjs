import { BrowserLauncher } from './prod-perf-browser-launcher.mjs'
import { CDPClient } from './prod-perf-cdp-client.mjs'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const preview = spawn(
  process.execPath,
  [
    root + '/node_modules/vite/bin/vite.js',
    'preview',
    '--config',
    'audit/prod-perf-vite.config.mjs',
    '--host',
    '127.0.0.1',
    '--port',
    '4198',
    '--strictPort',
  ],
  { cwd: root, stdio: 'ignore' }
)
let browser, session
try {
  await pause(1000)
  browser = await new BrowserLauncher().launch({
    debugPort: 9228,
    url: 'http://127.0.0.1:4198/prod-perf/prod-perf-ui.html',
  })
  session = await new CDPClient().connect(9228)
  session.on('Runtime.exceptionThrown', (data) =>
    console.log(
      'EXCEPTION',
      data.exceptionDetails.exception?.description || data.exceptionDetails.text
    )
  )
  session.on('Runtime.consoleAPICalled', (data) =>
    console.log(
      'CONSOLE',
      data.type,
      data.args.map((a) => a.value || a.description?.slice(0, 300))
    )
  )
  await session.send('Runtime.enable')
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await pause(1000)
  console.log(
    'BEFORE',
    await session.send('Runtime.evaluate', {
      expression:
        'JSON.stringify({api:!!window.__prodPerf,body:document.body.innerText.slice(0,300)})',
      returnByValue: true,
    })
  )
  console.log(
    'START',
    await session.send('Runtime.evaluate', {
      expression:
        'window.__prodPerf.prepare({size:10,mode:"worker",profile:"core",layoutContainment:true})',
      objectGroup: 'debug',
    })
  )
  await pause(5000)
  console.log(
    'AFTER',
    await session.send('Runtime.evaluate', {
      expression:
        'JSON.stringify({state:window.__prodPerf.state(),status:document.querySelector("#audit-status").textContent,html:document.querySelector(".markdown-body")?.innerHTML.slice(0,300),bodyStyle:document.querySelector(".bytemd-body")?.getAttribute("class")})',
      returnByValue: true,
    })
  )
  const shot = await session.send('Page.captureScreenshot')
  writeFileSync(
    root + '/audit/prod-perf-debug-mount.png',
    Buffer.from(shot.data, 'base64')
  )
} finally {
  await session?.disconnect()
  await browser?.close()
  preview.kill()
}
