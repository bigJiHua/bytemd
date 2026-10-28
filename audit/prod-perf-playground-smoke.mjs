import { BrowserLauncher } from './prod-perf-browser-launcher.mjs'
import { CDPClient } from './prod-perf-cdp-client.mjs'
import { evalInPage, waitForPage } from './prod-perf-sample.mjs'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const url = process.env.PLAYGROUND_URL || 'http://127.0.0.1:5173/playground/'
const browser = await new BrowserLauncher().launch({ debugPort: 9228, url })
let session
try {
  session = await new CDPClient().connect(9228, url)
  await session.send('Runtime.enable')
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await waitForPage(
    session,
    '!!document.querySelector(".bytemd-mermaid svg") && document.querySelectorAll(".katex").length >= 2'
  )
  const result = await evalInPage(
    session,
    `
    const root = document.querySelector('.bytemd');
    const preview = root.querySelector('.markdown-body');
    return {url:location.href, visible:document.visibilityState, editor:!!root.querySelector('.CodeMirror'),
      accordion:preview.querySelectorAll('.bytemd-accordion').length, details:preview.querySelectorAll('details').length,
      timeline:preview.querySelectorAll('.bytemd-timeline').length, timelineItems:preview.querySelectorAll('.bytemd-timeline-item').length,
      math:preview.querySelectorAll('.katex').length, highlight:preview.querySelectorAll('pre code.hljs').length,
      mermaid:preview.querySelectorAll('.bytemd-mermaid svg').length, copy:preview.querySelectorAll('.bytemd-copy-btn').length,
      errors:root.querySelectorAll('[role="alert"]').length, pending:root.querySelectorAll('.bytemd-render-pending').length};
  `
  )
  if (
    !result.editor ||
    result.accordion !== 1 ||
    result.details !== 3 ||
    result.timeline !== 1 ||
    result.timelineItems !== 5 ||
    result.math !== 2 ||
    result.highlight !== 5 ||
    result.mermaid !== 1 ||
    result.copy !== 5 ||
    result.errors ||
    result.pending
  )
    throw new Error(`Playground fixture mismatch: ${JSON.stringify(result)}`)
  writeFileSync(
    root + '/audit/prod-perf-review-playground.json',
    JSON.stringify(result, null, 2)
  )
  const screenshot = await session.send('Page.captureScreenshot')
  writeFileSync(
    root + '/audit/prod-perf-review-playground.png',
    Buffer.from(screenshot.data, 'base64')
  )
  console.log(JSON.stringify(result, null, 2))
} finally {
  await session?.disconnect()
  await browser.close()
}
