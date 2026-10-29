// bytemd 2.0.0 (CM6) local-release input verification: real CDP keyboard
// input, toolbar actions (core + gfm/mermaid plugin actions), plugin preview
// rendering, composition IME, single-step undo and output integrity against
// the production playground build. Results go to
// audit/cm6-v2-input-results.json (gitignored).
import { BrowserLauncher } from './prod-perf-browser-launcher.mjs'
import { CDPClient } from './prod-perf-cdp-client.mjs'
import { CompositionInjector } from './prod-perf-composition-injector.mjs'
import { KeyboardInjector } from './prod-perf-keyboard-injector.mjs'
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const vite = join(root, 'node_modules/vite/bin/vite.js')
const previewPort = Number(process.argv[2] || 5190)
const debugPort = 9522
const pageUrl = `http://127.0.0.1:${previewPort}/playground/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const preview = spawn(
  process.execPath,
  [
    vite,
    'preview',
    '--config',
    'vite.config.mjs',
    '--host',
    '127.0.0.1',
    '--port',
    String(previewPort),
    '--strictPort',
  ],
  { cwd: join(root, 'playground'), stdio: 'ignore' },
)

const consoleProblems = []

async function main() {
  const deadline = Date.now() + 30000
  let reachable = false
  while (Date.now() < deadline && !reachable) {
    try {
      if ((await fetch(pageUrl)).ok) reachable = true
    } catch {}
    await sleep(250)
  }
  if (!reachable) throw new Error('Preview did not start')

  const browser = await new BrowserLauncher().launch({
    debugPort,
    headless: true,
    url: pageUrl,
  })
  let session
  try {
    session = await new CDPClient().connect(debugPort, pageUrl)
    session.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type !== 'error' && type !== 'warning') return
      const text = args.map((a) => a.value ?? a.description ?? '').join(' ')
      if (text.includes('favicon.ico')) return
      consoleProblems.push(`${type}: ${text}`)
    })
    session.on('Log.entryAdded', ({ entry }) => {
      if (entry.level !== 'error' && entry.level !== 'warning') return
      if (
        entry.text.includes('favicon.ico') ||
        entry.url?.includes('favicon.ico')
      )
        return
      consoleProblems.push(`${entry.level}: ${entry.text} ${entry.url ?? ''}`)
    })
    await session.send('Runtime.enable')
    await session.send('Page.enable')
    await session.send('Log.enable')
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    })
    // All completions travel as JSON strings: with returnByValue this CDP
    // setup intermittently reports `type: undefined` for boolean/object
    // completion values even though the page side effects applied; string
    // returns have never been affected.
    const evaluate = async (expression) => {
      const result = await session.send('Runtime.evaluate', {
        expression: `(async () => {
          const __v = await (async () => { ${expression} })();
          return JSON.stringify(__v === undefined ? null : __v);
        })()`,
        awaitPromise: true,
        returnByValue: true,
      })
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.exception?.description ||
            result.exceptionDetails.text,
        )
      return JSON.parse(result.result.value)
    }
    const keyboard = new KeyboardInjector()
    const composition = new CompositionInjector()
    const results = {}
    const checks = []
    const check = (name, ok, detail) => {
      checks.push({ name, ok: !!ok, detail })
      if (!ok) console.error(`CHECK FAILED: ${name} ${detail ?? ''}`)
    }
    const waitForPreview = async (probe, timeout = 8000) => {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        if (await evaluate(`return ${probe}`)) return true
        await sleep(250)
      }
      return false
    }
    const editorReady = () =>
      evaluate(`return !!document.querySelector('.CodeMirror')`)

    await sleep(2500)
    if (!(await editorReady())) throw new Error('playground editor missing')

    // Reset to a known document and place the cursor at the end.
    await evaluate(`(() => {
      const cm = document.querySelector('.CodeMirror').CodeMirror
      cm.setValue('')
      cm.focus()
      return true
    })()`)
    await sleep(300)

    // 1. Real keyboard input -> editor value and rendered preview.
    const typed = 'CM6 V2 输入ABC123'
    await keyboard.typeText(session, typed)
    const typedInValue = await evaluate(
      `return document.querySelector('.CodeMirror').CodeMirror.getValue()`,
    )
    check(
      'keyboard value',
      typedInValue === typed,
      JSON.stringify(typedInValue),
    )
    const typedRendered = await waitForPreview(
      `document.querySelector('.markdown-body')?.textContent?.includes(${JSON.stringify(typed)})`,
    )
    check('keyboard preview render', typedRendered)

    // 2. Enter creates a new line through CM6 input handling.
    await keyboard.pressKey(session, 'Enter')
    await keyboard.typeText(session, 'second line')
    const enterValue = await evaluate(
      `return document.querySelector('.CodeMirror').CodeMirror.getValue()`,
    )
    check(
      'enter line break',
      enterValue === typed + '\nsecond line',
      JSON.stringify(enterValue),
    )

    // 3. Bold action on a selection + single-step undo.
    await evaluate(`(() => {
      const cm = document.querySelector('.CodeMirror').CodeMirror
      cm.setValue('bold target here')
      cm.setSelection({ line: 0, ch: 5 }, { line: 0, ch: 11 })
      cm.focus()
      return true
    })()`)
    // Clicks dispatch actions whose CDP completion value can come back
    // undefined; the observable document state is the assertion.
    await evaluate(`(() => {
      const icon = [...document.querySelectorAll('.bytemd-toolbar-icon')].find(
        (el) => el.getAttribute('aria-label') === 'Bold',
      )
      if (!icon) throw new Error('Bold icon not found')
      icon.click()
      return true
    })()`)
    const boldValue = await evaluate(
      `return document.querySelector('.CodeMirror').CodeMirror.getValue()`,
    )
    check(
      'bold value',
      boldValue === 'bold **target** here',
      JSON.stringify(boldValue),
    )
    const boldRendered = await waitForPreview(
      `!!document.querySelector('.markdown-body strong')`,
    )
    check('bold preview strong', boldRendered)
    // Single undo restores the pre-wrap text.
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'z',
      code: 'KeyZ',
      windowsVirtualKeyCode: 90,
      modifiers: 2,
    })
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z' })
    const undoValue = await evaluate(
      `return document.querySelector('.CodeMirror').CodeMirror.getValue()`,
    )
    check(
      'single-step undo',
      undoValue === 'bold target here',
      JSON.stringify(undoValue),
    )

    // 4. gfm Table action (plugin action: appendBlock + setSelection).
    await evaluate(`(() => {
      const cm = document.querySelector('.CodeMirror').CodeMirror
      cm.setValue('')
      cm.focus()
      return true
    })()`)
    await sleep(200)
    await evaluate(`(() => {
      const icon = [...document.querySelectorAll('.bytemd-toolbar-icon')].find(
        (el) => el.getAttribute('aria-label') === 'Table',
      )
      if (!icon) throw new Error('Table icon not found')
      icon.click()
      return true
    })()`)
    // String-returning reads only: CDP completion values for objects are
    // intermittently reported as undefined even though side effects applied.
    const readString = async (expression) => {
      const first = await evaluate(expression).catch(() => null)
      if (typeof first === 'string') return first
      await sleep(400)
      return evaluate(expression)
    }
    const tableValue = await readString(
      `return document.querySelector('.CodeMirror').CodeMirror.getValue()`,
    )
    check(
      'gfm table value',
      /\| +\S+ +\|/.test(tableValue ?? '') &&
        (tableValue ?? '').includes('| --- |'),
      JSON.stringify(tableValue),
    )
    const tableCursor = await readString(
      `return (() => {
        const c = document.querySelector('.CodeMirror').CodeMirror.getCursor('from')
        return c.line + ':' + c.ch
      })()`,
    )
    const [cursorLine, cursorCh] = (tableCursor ?? '0:0').split(':').map(Number)
    // On an empty document the blank first line stays as the separator, so
    // the table content (and the heading selection) lands on line 1.
    check(
      'gfm table cursor on heading text',
      cursorCh === 2 && (cursorLine === 1 || cursorLine === 0),
      tableCursor,
    )
    const tableRendered = await waitForPreview(
      `!!document.querySelector('.markdown-body table')`,
    )
    check('gfm table preview', tableRendered)

    // 5. Mermaid dropdown action -> fenced block -> rendered svg.
    await evaluate(`(() => {
      const icon = [...document.querySelectorAll('.bytemd-toolbar-icon')].find(
        (el) => (el.getAttribute('aria-label') || '').startsWith('Mermaid'),
      )
      if (!icon) throw new Error('Mermaid icon not found')
      icon.click()
      return true
    })()`)
    await sleep(500)
    await evaluate(`(() => {
      const items = [...document.querySelectorAll('.bytemd-dropdown-item')]
      if (!items.length) throw new Error('mermaid dropdown did not open')
      items[0].click()
      return items.length
    })()`)
    const mermaidValue = await evaluate(
      `return document.querySelector('.CodeMirror').CodeMirror.getValue()`,
    )
    check(
      'mermaid fence value',
      (mermaidValue ?? '').includes('```mermaid'),
      JSON.stringify((mermaidValue ?? '').slice(0, 60)),
    )
    const mermaidRendered = await waitForPreview(
      `!!document.querySelector('.markdown-body svg')`,
      15000,
    )
    check('mermaid svg rendered', mermaidRendered)

    // 6. Math plugin viewerEffect renders KaTeX.
    await evaluate(`(() => {
      const cm = document.querySelector('.CodeMirror').CodeMirror
      cm.setValue('Euler: $E=mc^2$')
      cm.focus()
      cm.setCursor({ line: 0, ch: 18 })
      return true
    })()`)
    const katexRendered = await waitForPreview(
      `!!document.querySelector('.markdown-body .katex')`,
    )
    check('math katex rendered', katexRendered)

    // 7. Highlight plugin renders hljs tokens.
    await evaluate(`(() => {
      const cm = document.querySelector('.CodeMirror').CodeMirror
      cm.setValue('\`\`\`js\\nconst answer = 42\\n\`\`\`')
      cm.focus()
      return true
    })()`)
    const hljsRendered = await waitForPreview(
      `!!document.querySelector('.markdown-body .hljs-keyword, .markdown-body .hljs')`,
    )
    check('highlight hljs rendered', hljsRendered)

    // 8. Frontmatter: editor yaml decorations; preview drops the yaml block.
    await evaluate(`(() => {
      const cm = document.querySelector('.CodeMirror').CodeMirror
      cm.setValue('---\\ntitle: Doc Title\\nnum: 42\\n---\\n\\nBody after frontmatter')
      cm.focus()
      return true
    })()`)
    await sleep(400)
    const fmKeys = await readString(
      `return [...document.querySelector('.CodeMirror').querySelectorAll('.bytemd-yaml-key')].map((n) => n.textContent).join(',')`,
    )
    const fmPreview = await readString(
      `return (() => {
        const text = document.querySelector('.markdown-body')?.textContent ?? ''
        return [text.includes('Doc Title'), text.includes('Body after frontmatter')].join('|')
      })()`,
    )
    check('frontmatter editor decorations', fmKeys === 'title,num', fmKeys)
    check(
      'frontmatter not rendered as body',
      fmPreview === 'false|true',
      fmPreview,
    )

    // 9. Composition IME through CDP, final text lands in value and preview.
    await evaluate(`(() => {
      const cm = document.querySelector('.CodeMirror').CodeMirror
      cm.setValue('before ')
      cm.focus()
      cm.setCursor({ line: 0, ch: 7 })
      return true
    })()`)
    await sleep(200)
    let compositionResult = null
    try {
      compositionResult = await composition.compose(session, '中文输入')
    } catch (error) {
      compositionResult = { error: String(error.message || error) }
    }
    await sleep(400)
    const compValue = await evaluate(
      `return document.querySelector('.CodeMirror').CodeMirror.getValue()`,
    )
    check(
      'composition value',
      compValue === 'before 中文输入',
      JSON.stringify(compValue),
    )
    const compRendered = await waitForPreview(
      `document.querySelector('.markdown-body')?.textContent?.includes('中文输入')`,
    )
    check('composition preview render', compRendered)

    // 10. Output integrity: total document round-trips without loss.
    const integrity = JSON.parse(
      await readString(`return (() => {
        const cm = document.querySelector('.CodeMirror').CodeMirror
        const doc = '# T\\n\\n段落 **bold** \`\`code\`\` [l](u) 完'
        cm.setValue(doc)
        return JSON.stringify({ out: cm.getValue(), expect: doc })
      })()`),
    )
    check(
      'round-trip integrity',
      integrity.out === integrity.expect,
      JSON.stringify(integrity).slice(0, 120),
    )

    results.checks = checks
    results.compositionEvents = compositionResult?.events?.length ?? 0
    results.compositionError = compositionResult?.error ?? null
    results.consoleProblems = consoleProblems
    results.pageUrl
    results.measuredAt = new Date().toISOString()
    await writeFile(
      join(root, 'audit/cm6-v2-input-results.json'),
      JSON.stringify(results, null, 2),
    )
    const failed = checks.filter((c) => !c.ok)
    console.log(
      JSON.stringify(
        {
          total: checks.length,
          failed: failed.length,
          compositionEvents: results.compositionEvents,
          consoleProblems: consoleProblems.length,
        },
        null,
        2,
      ),
    )
    if (failed.length || consoleProblems.length) process.exitCode = 1
    else console.log('INPUT VERIFY PASSED')
    return results
  } finally {
    await session?.disconnect().catch(() => {})
    await browser?.close()
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => preview.kill())
