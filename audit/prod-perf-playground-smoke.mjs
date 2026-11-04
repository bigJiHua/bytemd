import { rootDir } from '../scripts/utils.mjs'
import { BrowserLauncher } from './prod-perf-browser-launcher.mjs'
import { CDPClient, evalInPage, waitForPage } from './prod-perf-cdp-client.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { build, createServer, preview } from 'vite'

const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'both' },
    output: { type: 'string' },
    url: { type: 'string' },
    port: { type: 'string', default: '5198' },
    'debug-port': { type: 'string', default: '9398' },
    help: { type: 'boolean' },
  },
})
if (values.help) {
  console.log(
    'Usage: pnpm run test:playground [--mode both|dev|preview] [--output NEW_AUDIT_DIRECTORY] [--port 5198] [--debug-port 9398]\n' +
      'Requires pnpm build and Chrome (or CHROME_PATH). --url / PLAYGROUND_URL tests an existing local server. Default: managed dev + production preview.',
  )
  process.exit(0)
}
assert.ok(['both', 'dev', 'preview'].includes(values.mode), 'Invalid mode')
const port = Number(values.port)
const debugPort = Number(values['debug-port'])
for (const value of [port, debugPort])
  assert.ok(
    Number.isInteger(value) && value > 0 && value <= 65535,
    'Invalid port',
  )
assert.notEqual(port, debugPort, 'HTTP and CDP ports must differ')
const externalUrl = values.url ?? process.env.PLAYGROUND_URL
if (externalUrl) {
  const url = new URL(externalUrl)
  assert.ok(
    ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'Playground URL must be local',
  )
}
const audit = path.join(rootDir, 'audit')
let output
if (values.output) {
  output = path.resolve(rootDir, values.output)
  const relative = path.relative(audit, output)
  assert.ok(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    'Evidence must stay inside audit/',
  )
  // Explicit output directories must be new, preserving earlier evidence.
  await fs.mkdir(output)
} else output = await fs.mkdtemp(path.join(audit, 'prod-perf-playground-'))

const playground = path.join(rootDir, 'playground')
const original = await fs.readFile(path.join(playground, 'src/text.md'), 'utf8')
const locales = Object.fromEntries(
  await Promise.all(
    ['en', 'zh_Hans'].map(async (key) => [
      key,
      JSON.parse(
        await fs.readFile(
          path.join(rootDir, 'packages/bytemd/locales', `${key}.json`),
          'utf8',
        ),
      ),
    ]),
  ),
)
const report = {
  output,
  manualIME: 'incomplete',
  realMobileDevice: 'incomplete',
  phases: [],
}
console.log(`Playground evidence: ${output}`)

async function run(mode) {
  const result = { mode, status: 'pending', checks: [], runtimeErrors: [] }
  report.phases.push(result)
  let server, browser, session
  const evaluate = (body) => evalInPage(session, body)
  const wait = (condition) => waitForPage(session, condition, 30000)
  const element = (selector) =>
    `document.querySelector(${JSON.stringify(selector)})`
  const clickElement = async (expression) => {
    const point = await evaluate(`
      let diagnostic;
      for (let attempt = 0; attempt < 4; attempt++) {
        let element = ${expression};
        if (!element) throw new Error('Click target missing');
        element.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
        // Preview commits and scroll synchronization may replace or move the
        // target after scrolling. Reacquire it and wait for stable geometry.
        let previous, stable = 0;
        for (let i = 0; i < 30 && stable < 3; i++) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          element = ${expression};
          if (!element) break;
          const rect = element.getBoundingClientRect();
          stable = previous && Math.abs(rect.y - previous.y) < 1 && Math.abs(rect.x - previous.x) < 1 ? stable + 1 : 0;
          previous = {x:rect.x,y:rect.y};
        }
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        let left = Math.max(0,rect.left), right = Math.min(innerWidth,rect.right);
        let top = Math.max(0,rect.top), bottom = Math.min(innerHeight,rect.bottom);
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
            left = Math.max(left,bounds.left); right = Math.min(right,bounds.right);
          }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            top = Math.max(top,bounds.top); bottom = Math.min(bottom,bounds.bottom);
          }
        }
        // A fixed sidebar escapes its containing editor's clipping. Let the
        // browser's hit test decide between full and clipped target geometry.
        const points = [{x:rect.x + rect.width / 2,y:rect.y + rect.height / 2}];
        if (right > left && bottom > top) points.push({x:(left + right) / 2,y:(top + bottom) / 2});
        let hit;
        for (const point of points) {
          hit = document.elementFromPoint(point.x,point.y);
          if (stable >= 3 && hit && element.contains(hit)) return point;
        }
        diagnostic = {connected:element.isConnected,rect:rect.toJSON(),hit:hit?.className,stable};
      }
      throw new Error('Click target is covered or detached: ' + JSON.stringify(diagnostic));
    `)
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...point,
    })
    for (const type of ['mousePressed', 'mouseReleased'])
      await session.send('Input.dispatchMouseEvent', {
        type,
        ...point,
        button: 'left',
        clickCount: 1,
      })
  }
  const click = (selector) => clickElement(element(selector))
  const toolbar = (label) =>
    click(`.bytemd-toolbar-icon[aria-label=${JSON.stringify(label)}]`)
  const key = async (code, modifiers = 0) => {
    const definition = {
      Enter: ['Enter', 13],
      Space: [' ', 32],
      Escape: ['Escape', 27],
      ArrowLeft: ['ArrowLeft', 37],
      ArrowRight: ['ArrowRight', 39],
      KeyB: ['b', 66],
      KeyZ: ['z', 90],
    }[code]
    assert.ok(definition, `Unsupported key: ${code}`)
    for (const type of ['keyDown', 'keyUp'])
      await session.send('Input.dispatchKeyEvent', {
        type,
        code,
        key: definition[0],
        windowsVirtualKeyCode: definition[1],
        modifiers,
        ...(type === 'keyDown' &&
        !modifiers &&
        ['Enter', 'Space'].includes(code)
          ? {
              text: code === 'Enter' ? '\r' : ' ',
              unmodifiedText: code === 'Enter' ? '\r' : ' ',
            }
          : {}),
      })
  }
  const setText = async (text) => {
    await evaluate(
      `document.querySelector('.CodeMirror').CodeMirror.setValue(${JSON.stringify(text)})`,
    )
    await wait(
      `document.querySelector('.CodeMirror').CodeMirror.getValue() === ${JSON.stringify(text.replaceAll('\r\n', '\n'))}`,
    )
  }
  const saveScreenshot = async (name) => {
    const screenshot = await session.send('Page.captureScreenshot')
    await fs.writeFile(
      path.join(output, `${mode}-${name}.png`),
      Buffer.from(screenshot.data, 'base64'),
    )
  }
  const check = async (name, action) => {
    console.log(`[${mode}] ${name}`)
    try {
      const detail = await action()
      result.checks.push({ name, passed: true, ...detail })
    } catch (error) {
      result.checks.push({ name, passed: false, error: error.message })
      throw error
    }
  }
  const defaultReady = `!!document.querySelector('.bytemd-preview .markdown-body > .bytemd-mermaid svg') &&
    document.querySelectorAll('.bytemd-preview .katex').length >= 2 &&
    [...document.querySelectorAll('.bytemd-preview img')].every(image => image.complete && image.naturalWidth > 0)`
  try {
    if (mode === 'dev') {
      server = await createServer({
        root: playground,
        configFile: path.join(playground, 'vite.config.mjs'),
        server: { host: '127.0.0.1', port, strictPort: true },
      })
      await server.listen()
    } else if (mode === 'preview') {
      const outDir = path.join(output, 'playground-dist')
      await build({
        root: playground,
        configFile: path.join(playground, 'vite.config.mjs'),
        build: { outDir, emptyOutDir: false },
      })
      result.build = 'passed'
      server = await preview({
        root: playground,
        configFile: path.join(playground, 'vite.config.mjs'),
        build: { outDir },
        preview: { host: '127.0.0.1', port, strictPort: true },
      })
    }
    result.url = externalUrl ?? `http://127.0.0.1:${port}/playground/`
    // Enable error collection before loading the app, including startup errors.
    browser = await new BrowserLauncher().launch({
      debugPort,
      headless: true,
      url: 'about:blank',
    })
    session = await new CDPClient().connect(debugPort, 'about:blank')
    session.on('Runtime.exceptionThrown', (event) =>
      result.runtimeErrors.push(event.exceptionDetails),
    )
    session.on('Runtime.consoleAPICalled', (event) => {
      if (event.type === 'error') result.runtimeErrors.push(event)
    })
    await session.send('Runtime.enable')
    await session.send('Page.enable')
    const viewport = (width) =>
      session.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
    await viewport(1280)
    await session.send('Page.navigate', { url: result.url })
    await wait(defaultReady)
    await check('default fixture and layout', async () => {
      const snapshot = await evaluate(`
        const body = document.querySelector('.bytemd-preview .markdown-body');
        const counts = Object.fromEntries(['.katex','pre code.hljs','.bytemd-mermaid svg','.bytemd-copy-btn','pre',
          '.bytemd-accordion','details','.bytemd-timeline-item','.bytemd-pinyin','.bytemd-callout'].map(s=>[s,body.querySelectorAll(s).length]));
        const badge = document.querySelector('.badges').getBoundingClientRect();
        const overlaps = [...document.querySelectorAll('.line')].some(e => {
          const r=e.getBoundingClientRect(); return r.left < badge.right && r.right > badge.left && r.top < badge.bottom && r.bottom > badge.top;
        });
        return {counts, badgesOverlapControls:overlaps, heading:body.querySelector('h1').textContent};
      `)
      for (const selector of [
        '.katex',
        'pre code.hljs',
        '.bytemd-mermaid svg',
        '.bytemd-accordion',
        'details',
        '.bytemd-timeline-item',
        '.bytemd-pinyin',
        '.bytemd-callout',
      ])
        assert.ok(snapshot.counts[selector] > 0, `Missing ${selector}`)
      assert.equal(
        snapshot.counts['.bytemd-copy-btn'],
        snapshot.counts.pre,
        'One copy button per finished code block',
      )
      assert.equal(snapshot.badgesOverlapControls, false)
      await saveScreenshot('desktop')
      return snapshot
    })
    await check('accordion and table of contents', async () => {
      await click('.bytemd-accordion-title')
      await wait(`document.querySelector('.bytemd-accordion-item').open`)
      await click('.bytemd-accordion-title')
      await wait(`!document.querySelector('.bytemd-accordion-item').open`)
      await toolbar(locales.en.toc)
      await wait(
        `!document.querySelector('.bytemd-toc').classList.contains('bytemd-hidden')`,
      )
      await clickElement(
        `[...document.querySelectorAll('.bytemd-toc-button')].find(e=>e.textContent.includes('时间线'))`,
      )
      await wait(`(() => {
        const preview=document.querySelector('.bytemd-preview').getBoundingClientRect();
        const heading=[...document.querySelectorAll('.bytemd-preview h2')].find(e=>e.textContent.includes('时间线')).getBoundingClientRect();
        return heading.top >= preview.top - 2 && heading.top < preview.bottom;
      })()`)
      await toolbar(locales.en.closeToc)
    })
    await check('clipboard', async () => {
      await session.send('Browser.grantPermissions', {
        origin: new URL(result.url).origin,
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      })
      const expected = await evaluate(
        `return document.querySelector('.bytemd-preview pre code').textContent`,
      )
      await click('.bytemd-preview .bytemd-copy-btn')
      await wait(
        `document.querySelector('.bytemd-preview .bytemd-copy-btn').textContent === ${JSON.stringify(locales.en.copySuccess)}`,
      )
      const actual = await evaluate(
        'return await navigator.clipboard.readText()',
      )
      // Windows normalizes system clipboard line endings to CRLF.
      assert.equal(
        actual.replaceAll('\r\n', '\n'),
        expected.replaceAll('\r\n', '\n'),
      )
    })
    await check('image lightbox navigation and cleanup', async () => {
      assert.equal(
        await evaluate(
          `return !!document.querySelector('.bytemd-hr-text img.medium-zoom-image')`,
        ),
        false,
      )
      await click('.bytemd-preview img.medium-zoom-image')
      await wait(`!!document.querySelector('.bytemd-zoom-ui')`)
      const first = await evaluate(
        `return document.querySelector('.bytemd-zoom-counter').textContent`,
      )
      await click('.bytemd-zoom-next')
      await wait(
        `document.querySelector('.bytemd-zoom-counter')?.textContent !== ${JSON.stringify(first)}`,
      )
      await key('Escape')
      await wait(
        `!document.querySelector('.bytemd-zoom-ui') && !document.querySelector('.medium-zoom-overlay')`,
      )
      assert.notEqual(
        await evaluate('return document.body.style.overflow'),
        'hidden',
      )
      return { firstImage: first, nextImage: true, closed: true }
    })
    await check('dark theme and localization', async () => {
      await evaluate(
        `document.querySelector('.CodeMirror').CodeMirror.scrollTo(0,0);document.querySelector('.bytemd-preview').scrollTop=0;window.scrollTo(0,0)`,
      )
      await click('.line button')
      await wait(
        `document.documentElement.classList.contains('dark') && [...document.styleSheets].some(s=>s.href?.includes('github-dark'))`,
      )
      assert.equal(
        await evaluate(
          `return getComputedStyle(document.querySelector('.markdown-body')).getPropertyValue('--md-surface').trim()`,
        ),
        '#0d1117',
      )
      await saveScreenshot('dark')
      await click('.line button')
      await evaluate(
        `const select=document.querySelector('.line select');select.value='zh_Hans';select.dispatchEvent(new Event('change',{bubbles:true}))`,
      )
      await wait(
        `!!document.querySelector('.bytemd-toolbar-icon[aria-label=${JSON.stringify(locales.zh_Hans.tool)}]')`,
      )
      assert.ok(
        (
          await evaluate(
            `return document.querySelector('.bytemd-status').textContent`,
          )
        ).includes(locales.zh_Hans.words),
      )
      await evaluate(
        `const select=document.querySelector('.line select');select.value='en';select.dispatchEvent(new Event('change',{bubbles:true}))`,
      )
      await wait(
        `!!document.querySelector('.bytemd-toolbar-icon[aria-label="Tool"]')`,
      )
    })
    await check('keyboard editing, bold shortcut and undo', async () => {
      await setText('# Keyboard test\n\nstart')
      await wait(
        `document.querySelector('.markdown-body h1')?.textContent === 'Keyboard test'`,
      )
      await evaluate(
        `const cm=document.querySelector('.CodeMirror').CodeMirror;cm.focus();cm.setCursor(cm.lineCount()-1,5)`,
      )
      await session.send('Input.insertText', { text: ' 中文输入' })
      await wait(
        `document.querySelector('.bytemd-preview').textContent.includes('start 中文输入')`,
      )
      await evaluate(
        `const cm=document.querySelector('.CodeMirror').CodeMirror;cm.setSelection({line:2,ch:0},{line:2,ch:5});cm.focus()`,
      )
      await key('KeyB', 2)
      await wait(
        `document.querySelector('.bytemd-preview strong')?.textContent === 'start'`,
      )
      await key('KeyZ', 2)
      await wait(
        `!document.querySelector('.bytemd-preview strong') && document.querySelector('.bytemd-preview').textContent.includes('start 中文输入')`,
      )
      return {
        textInsertion: 'CDP Input.insertText',
        shortcut: 'Ctrl+B',
        undo: 'Ctrl+Z',
      }
    })
    await check('Tool keyboard presets and action', async () => {
      await toolbar(locales.en.tool)
      await wait(
        `!document.querySelector('.bytemd-tool').classList.contains('bytemd-hidden')`,
      )
      await evaluate(`document.querySelector('.bytemd-tool-toggle').focus()`)
      await key('Enter')
      await wait(
        `document.querySelector('.bytemd-tool-toggle').getAttribute('aria-expanded') === 'true'`,
      )
      await key('Space')
      await wait(
        `document.querySelector('.bytemd-tool-toggle').getAttribute('aria-expanded') === 'false'`,
      )
      await click('.bytemd-tool-use')
      await wait(
        `document.querySelector('.CodeMirror').CodeMirror.getValue().includes('[size=20]') && document.querySelector('.bytemd-tool').classList.contains('bytemd-hidden')`,
      )
    })
    await check('maximum length remains advisory', async () => {
      await setText('# Limit test\n\n123456789')
      await evaluate(
        `const input=document.querySelector('.line input[type=number]');input.value='5';input.dispatchEvent(new Event('input',{bubbles:true}))`,
      )
      await wait(`!!document.querySelector('.bytemd-status-error')`)
      await evaluate(
        `const cm=document.querySelector('.CodeMirror').CodeMirror;cm.focus();cm.setCursor(cm.lineCount()-1,9)`,
      )
      await session.send('Input.insertText', { text: 'MORE' })
      await wait(
        `document.querySelector('.bytemd-preview').textContent.includes('123456789MORE')`,
      )
      await evaluate(
        `const input=document.querySelector('.line input[type=number]');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))`,
      )
      await wait(`!document.querySelector('.bytemd-status-error')`)
    })
    const pluginElement = (name) =>
      `[...document.querySelectorAll('.line label')].find(e=>e.textContent.trim()===${JSON.stringify(name)}).querySelector('input')`
    const defaults = await evaluate(
      `return Object.fromEntries([...document.querySelectorAll('.line input[type=checkbox]')].map(e=>[e.parentElement.textContent.trim(),e.checked]))`,
    )
    await setText('# Plugin checks')
    for (const [name, enabled] of Object.entries(defaults))
      if (enabled) {
        await clickElement(pluginElement(name))
        await wait(`!(${pluginElement(name)}).checked`)
      }
    await setText(
      '---\ntitle: Playground metadata\n---\n\n# Plugin switches\n\n:rocket:\n\n~~strike~~\n\n- [x] task\n\n| A | B |\n| --- | --- |\n| a | b |\n\n```js\nconst answer = 42\n```\n\n$a+b$\n\n$$\nc^2\n$$\n\n```mermaid\ngraph TD\nA --> B\n```\n\n![Image](' +
        new URL('plugin.svg', result.url).href +
        ')\n\nline one\nline two',
    )
    const pluginConditions = {
      frontmatter: `!document.querySelector('.bytemd-preview').textContent.includes('Playground metadata')`,
      gemoji: `document.querySelector('.bytemd-preview').textContent.includes('🚀')`,
      gfm: `!!document.querySelector('.bytemd-preview table') && !!document.querySelector('.bytemd-preview del')`,
      highlight: `!!document.querySelector('.bytemd-preview code.hljs')`,
      math: `document.querySelectorAll('.bytemd-preview .katex').length === 2`,
      mermaid: `!!document.querySelector('.bytemd-preview .markdown-body > .bytemd-mermaid svg')`,
      'medium-zoom': `!!document.querySelector('.bytemd-preview img.medium-zoom-image')`,
      breaks: `[...document.querySelectorAll('.bytemd-preview p')].some(e=>e.textContent.includes('line one') && !!e.querySelector('br'))`,
    }
    for (const [name, condition] of Object.entries(pluginConditions))
      await check(`plugin ${name}: enable and disable`, async () => {
        await wait(`!(${condition})`)
        await clickElement(pluginElement(name))
        await wait(condition)
        await clickElement(pluginElement(name))
        await wait(`!(${condition})`)
      })
    await setText('# Restore plugins')
    for (const [name, enabled] of Object.entries(defaults))
      if (enabled) {
        await clickElement(pluginElement(name))
        await wait(`(${pluginElement(name)}).checked`)
      }
    await setText(original)
    await wait(defaultReady)
    await check('fullscreen and tab keyboard navigation', async () => {
      await toolbar(locales.en.fullscreen)
      await wait(
        `document.querySelector('.bytemd').classList.contains('bytemd-fullscreen')`,
      )
      await toolbar(locales.en.exitFullscreen)
      await wait(
        `!document.querySelector('.bytemd').classList.contains('bytemd-fullscreen')`,
      )
      await click('.line input[type=radio][value=tab]')
      await wait(
        `document.querySelectorAll('.bytemd-toolbar-tab').length === 2`,
      )
      await evaluate(`document.querySelector('.bytemd-toolbar-tab').focus()`)
      await key('ArrowRight')
      await wait(
        `document.querySelectorAll('.bytemd-toolbar-tab')[1].getAttribute('aria-selected') === 'true'`,
      )
      await click('.bytemd-toolbar-tab')
      await wait(
        `document.querySelector('.bytemd-toolbar-tab').getAttribute('aria-selected') === 'true'`,
      )
    })
    await check('390px forced split and Tool action', async () => {
      await click('.line input[type=radio][value=split]')
      await viewport(390)
      await wait(
        `document.querySelector('.bytemd').classList.contains('bytemd-narrow') && document.querySelectorAll('.bytemd-toolbar-tab').length === 2`,
      )
      await clickElement(`document.querySelectorAll('.bytemd-toolbar-tab')[1]`)
      await clickElement(`document.querySelectorAll('.bytemd-toolbar-tab')[1]`)
      await wait(
        `document.querySelectorAll('.bytemd-toolbar-tab')[1].getAttribute('aria-selected') === 'true' && getComputedStyle(document.querySelector('.bytemd-preview')).display !== 'none'`,
      )
      await toolbar(locales.en.tool)
      await wait(
        `!document.querySelector('.bytemd-tool').classList.contains('bytemd-hidden')`,
      )
      await saveScreenshot('narrow')
      const before = await evaluate(
        `return document.querySelector('.CodeMirror').CodeMirror.getValue()`,
      )
      await click('.bytemd-tool-use')
      await wait(
        `document.querySelector('.bytemd-toolbar-tab').getAttribute('aria-selected') === 'true' && document.querySelector('.bytemd-tool').classList.contains('bytemd-hidden')`,
      )
      assert.ok(
        await evaluate(
          `return document.querySelector('.CodeMirror').CodeMirror.getValue().includes('[size=20]')`,
        ),
      )
      assert.notEqual(
        await evaluate(
          `return document.querySelector('.CodeMirror').CodeMirror.getValue()`,
        ),
        before,
      )
      await viewport(1280)
      await click('.line input[type=radio][value=auto]')
      await setText(original)
      await wait(defaultReady)
    })
    assert.deepEqual(result.runtimeErrors, [], 'Browser errors')
    result.status = 'passed'
  } catch (error) {
    result.status = 'failed'
    result.error = error.stack
    if (session) await saveScreenshot('failure').catch(() => {})
    throw error
  } finally {
    await fs.writeFile(
      path.join(output, `${mode}-results.json`),
      JSON.stringify(result, null, 2),
    )
    await session?.disconnect()
    await browser?.close()
    if (mode === 'dev') await server?.close()
    else if (server)
      await new Promise((resolve) => server.httpServer.close(resolve))
  }
}

try {
  for (const mode of externalUrl
    ? ['external']
    : values.mode === 'both'
      ? ['dev', 'preview']
      : [values.mode])
    await run(mode)
} finally {
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify(report, null, 2),
  )
}
console.log(JSON.stringify(report, null, 2))
