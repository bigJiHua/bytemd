import { BrowserLauncher } from './prod-perf-browser-launcher.mjs'
import { runAllSampling } from './prod-perf-sample.mjs'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const vite = join(root, 'node_modules/vite/bin/vite.js')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function command(executable, args) {
  await new Promise((resolve, reject) => {
    const processHandle = spawn(executable, args, {
      cwd: root,
      stdio: 'inherit',
      shell: executable === 'pnpm.cmd',
    })
    processHandle.on('error', reject)
    processHandle.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Command exited ${code}: ${executable}`))
    )
  })
}

export async function reproduce(options = {}) {
  const {
    debugPort = 9238,
    previewPort = 4178,
    skipBuild = false,
    skipRegression = false,
    browserPath,
    auditDir = join(
      root,
      'audit',
      `prod-perf-run-${new Date().toISOString().replace(/[:.]/g, '-')}`
    ),
  } = options
  const report = {
    auditDir,
    build: skipBuild ? 'skipped' : 'pending',
    regression: skipRegression ? 'skipped' : 'pending',
    errors: [],
  }
  let preview, browser
  try {
    if (!skipRegression) {
      await command(pnpm, ['exec', 'vitest', 'run', '--threads', 'false'])
      report.regression = 'passed'
    }
    if (!skipBuild) {
      await command(pnpm, ['build'])
      report.build = 'passed'
    }
    if (!existsSync(join(root, 'packages/bytemd/svelte/index.js')))
      throw new Error('Missing built packages; run pnpm build')
    await command(process.execPath, [
      vite,
      'build',
      '--config',
      'audit/prod-perf-vite.config.mjs',
    ])
    const pageUrl = `http://127.0.0.1:${previewPort}/prod-perf/prod-perf-ui.html`
    // Never terminate unrelated processes that occupy a port.
    preview = spawn(
      process.execPath,
      [
        vite,
        'preview',
        '--config',
        'audit/prod-perf-vite.config.mjs',
        '--host',
        '127.0.0.1',
        '--port',
        String(previewPort),
        '--strictPort',
      ],
      { cwd: root, stdio: 'ignore' }
    )
    let startupError
    preview.on('error', (error) => {
      startupError = error
    })
    await sleep(300)
    const deadline = Date.now() + 30000
    let reachable = false
    while (Date.now() < deadline) {
      if (startupError || preview.exitCode !== null)
        throw (
          startupError ||
          new Error(`Preview failed; port ${previewPort} may be occupied`)
        )
      try {
        if ((await fetch(pageUrl)).ok) {
          reachable = true
          break
        }
      } catch {}
      await sleep(250)
    }
    if (!reachable) throw new Error('Preview did not start')
    browser = await new BrowserLauncher().launch({
      debugPort,
      headless: false,
      url: pageUrl,
      browserPath,
    })
    report.sampling = await runAllSampling({
      ...options,
      debugPort,
      pageUrl,
      auditDir,
    })
    report.errors.push(...report.sampling.errors)
  } catch (error) {
    report.errors.push({ phase: 'reproduce', error: error.stack })
  } finally {
    await browser?.close()
    preview?.kill()
  }
  return report
}

export function cliOptions(args = process.argv.slice(2)) {
  const options = {}
  for (const arg of args) {
    const [name, value] = arg.replace(/^--/, '').split('=')
    if (name === 'skip-build') options.skipBuild = true
    else if (name === 'layout-containment') options.layoutContainment = true
    else if (name === 'skip-regression') options.skipRegression = true
    else if (name === 'audit-dir') options.auditDir = resolve(value)
    else if (
      ['samples', 'memory-loops', 'preview-port', 'debug-port'].includes(name)
    )
      options[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] =
        Number(value)
    else if (
      ['phases', 'profiles', 'modes', 'sizes', 'variants'].includes(name)
    )
      options[name] = value
        .split(',')
        .map((item) => (name === 'sizes' ? Number(item) : item))
    else throw new Error(`Unknown option: ${arg}`)
  }
  for (const key of ['samples', 'memoryLoops', 'previewPort', 'debugPort']) {
    if (
      options[key] !== undefined &&
      (!Number.isSafeInteger(options[key]) || options[key] <= 0)
    )
      throw new Error(`Invalid ${key}`)
  }
  for (const [key, allowed] of Object.entries({
    sizes: [10, 100, 500],
    modes: ['sync', 'worker'],
    profiles: ['core', 'enhanced'],
    variants: [
      'baseline',
      'editor-layout',
      'preview-layout',
      'body-size',
      'body-size-layout',
    ],
    phases: [
      'performance',
      'composition',
      'memory',
      'comparison',
      'diagnostic',
      'interaction',
    ],
  })) {
    if (options[key]?.some((value) => !allowed.includes(value)))
      throw new Error(`Invalid ${key}`)
  }
  return options
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  reproduce(cliOptions()).then((report) => {
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.errors.length ? 1 : 0
  })
}
