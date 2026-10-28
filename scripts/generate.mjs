import _ from 'lodash-es'
import mustache from 'mustache'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import prettier from 'prettier'

export const rootDir = fileURLToPath(new URL('..', import.meta.url))
const markers = (name) => [
  `<!-- bytemd:${name}:start -->`,
  `<!-- bytemd:${name}:end -->`,
]

export function replaceRegion(source, name, content) {
  const [start, end] = markers(name)
  const starts = source.split(start).length - 1
  const ends = source.split(end).length - 1
  if (!starts && !ends) return source
  if (
    starts !== 1 ||
    ends !== 1 ||
    source.indexOf(start) >= source.indexOf(end)
  )
    throw new Error(`Invalid or duplicate ${name} markers.`)
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  return (
    source.slice(0, source.indexOf(start) + start.length) +
    newline +
    newline +
    content.trim().replace(/\r?\n/g, newline) +
    newline +
    newline +
    source.slice(source.indexOf(end))
  )
}

const defaults = (target, values) => {
  for (const [key, value] of Object.entries(values)) {
    if (!Object.hasOwn(target, key)) target[key] = structuredClone(value)
    else if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    )
      defaults(target[key], value)
  }
  return target
}
const entry = (name) => ({
  types: `./dist/${name}.d.ts`,
  import: `./dist/${name}.mjs`,
  require: `./dist/${name}.js`,
})
const parseObject = (text, file) => {
  const value = JSON.parse(text)
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new Error(`Expected a JSON object: ${file}`)
  return value
}
const portable = (value) => value.replace(/\\/g, '/').replace(/\/$/, '')
async function checkParent(root, destination) {
  const relative = path.relative(
    await fs.realpath(root),
    await fs.realpath(path.dirname(destination))
  )
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`Destination parent outside workspace: ${destination}`)
}

/** Build and validate all changes before writing. Existing fields and unmarked docs are owned by maintainers. */
export async function planGeneration(root = rootDir) {
  root = path.resolve(root)
  const changes = []
  const preservedDocs = []
  const read = async (relative) => {
    const absolute = path.join(root, relative)
    // Never follow a generated destination symlink into another workspace.
    try {
      await checkParent(root, absolute)
      if ((await fs.lstat(absolute)).isSymbolicLink())
        throw new Error(`Symlink destination: ${relative}`)
      return await fs.readFile(absolute, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return undefined
      throw error
    }
  }
  const add = (relative, before, after) => {
    if (before !== after)
      changes.push({ path: portable(relative), before, after })
  }
  const json = async (relative, fallback, update) => {
    const before = await read(relative)
    const original =
      before === undefined ? fallback : parseObject(before, relative)
    const next = update(structuredClone(original))
    // A no-op does not reformat a maintainer's existing JSON.
    add(
      relative,
      before,
      before !== undefined && JSON.stringify(original) === JSON.stringify(next)
        ? before
        : prettier.format(JSON.stringify(next), { parser: 'json' })
    )
    return next
  }
  const packageDirs = (
    await fs.readdir(path.join(root, 'packages'), { withFileTypes: true })
  )
    .filter((p) => p.isDirectory() && !p.isSymbolicLink())
    .map((p) => p.name)
    .sort()
  const packages = []
  for (const directory of packageDirs) {
    const relative = `packages/${directory}/package.json`
    if ((await read(relative)) === undefined) continue
    // Locale exports/files only make sense for packages that actually ship
    // locale data; advertising them otherwise breaks consumer resolution.
    let hasLocales = false
    try {
      hasLocales = (
        await fs.lstat(path.join(root, 'packages', directory, 'locales'))
      ).isDirectory()
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const pkg = await json(relative, {}, (pkg) => {
      if (typeof pkg.name !== 'string')
        throw new Error(`Missing package name: ${relative}`)
      if (
        pkg.exports !== undefined &&
        (!pkg.exports ||
          Array.isArray(pkg.exports) ||
          typeof pkg.exports !== 'object')
      )
        throw new Error(`Cannot extend non-object exports: ${relative}`)
      if (
        pkg.exports &&
        Object.keys(pkg.exports).some(
          (key) => key !== '.' && !key.startsWith('./')
        )
      )
        throw new Error(
          `Cannot extend conditional root exports; use a subpath map: ${relative}`
        )
      if (!hasLocales && pkg.exports) {
        delete pkg.exports['./locales/*']
        delete pkg.exports['./lib/locales/*']
      }
      const exports = {
        '.': {
          ...(pkg.name === 'bytemd'
            ? { types: './dist/index.d.ts', svelte: './svelte/index.js' }
            : {}),
          ...entry('index'),
        },
        ...(hasLocales
          ? {
              './locales/*': './locales/*',
              './lib/locales/*': './locales/*',
            }
          : {}),
      }
      if (pkg.name === 'bytemd') {
        for (const name of ['processor', 'worker'])
          exports[`./${name}`] = entry(name)
        for (const name of [
          'index.css',
          'index.min.css',
          'markdown.css',
          'markdown.min.css',
        ])
          exports[`./dist/${name}`] = `./dist/${name}`
      }
      // The fork ships ESM/CJS only: UMD and its CDN entry fields are retired
      // with the publish-format trim (PLAN Phase 3).
      delete pkg.jsdelivr
      delete pkg.unpkg
      defaults(pkg, {
        types: './dist/index.d.ts',
        module: './dist/index.mjs',
        main: './dist/index.js',
        exports,
        files: [],
      })
      // TypeScript's conditional resolution needs types before runtime conditions.
      for (const name of Object.keys(exports)) {
        const current = pkg.exports[name]
        if (
          current &&
          typeof current === 'object' &&
          !Array.isArray(current) &&
          Object.hasOwn(current, 'types')
        ) {
          const { types, ...conditions } = current
          pkg.exports[name] = { types, ...conditions }
        }
      }
      if (!Array.isArray(pkg.files))
        throw new Error(`Expected files array: ${relative}`)
      pkg.files = pkg.files.filter((value) => value !== 'locales' || hasLocales)
      for (const value of [
        'dist',
        ...(hasLocales ? ['locales'] : []),
        ...(pkg.name === 'bytemd' ? ['svelte'] : []),
      ])
        if (!pkg.files.includes(value)) pkg.files.push(value)
      return pkg
    })
    packages.push({ directory, pkg })
    await json(`packages/${directory}/tsconfig.json`, {}, (config) =>
      defaults(config, {
        extends: '../../tsconfig-base.json',
        include: ['src', 'src/locales/*.json'],
        compilerOptions: { rootDir: 'src', outDir: 'dist' },
        ...(pkg.dependencies?.bytemd ||
        pkg.devDependencies?.bytemd ||
        pkg.peerDependencies?.bytemd
          ? { references: [{ path: '../bytemd' }] }
          : {}),
      })
    )
    const license = await read('LICENSE')
    if (license === undefined) throw new Error('Missing root LICENSE.')
    const destination = `packages/${directory}/LICENSE`
    add(destination, await read(destination), license)
  }
  await json('tsconfig.json', {}, (config) => {
    defaults(config, { files: [], references: [] })
    if (!Array.isArray(config.references))
      throw new Error('Expected root references array.')
    for (const { directory } of packages) {
      const reference = `packages/${directory}`
      if (
        !config.references.some(
          (ref) =>
            typeof ref.path === 'string' &&
            portable(ref.path).replace(/^\.\//, '') === reference
        )
      )
        config.references.push({ path: reference })
    }
    return config
  })
  const plugins = packages.filter(({ directory }) =>
    directory.startsWith('plugin-')
  )
  const template = await read('scripts/plugin-template.md')
  for (const { directory, pkg } of plugins) {
    const destination = `packages/${directory}/README.md`
    const before = await read(destination)
    if (before !== undefined && !before.includes(markers('usage')[0])) {
      // Existing custom usage, failures and lightbox documentation is not regenerated.
      replaceRegion(before, 'usage', '') // validates orphan end markers
      preservedDocs.push(destination)
      continue
    }
    if (template === undefined) throw new Error('Missing plugin template.')
    const name = directory.slice('plugin-'.length)
    const rendered = prettier.format(
      mustache.render(template, {
        name,
        packageName: pkg.name,
        importedName: _.camelCase(name.replace(/-ssr$/, '')),
        desc: pkg.description,
        header: directory.startsWith('plugin-math')
          ? 'import "katex/dist/katex.css"'
          : directory.startsWith('plugin-highlight')
          ? 'import "highlight.js/styles/default.css"'
          : '',
      }),
      {
        parser: 'markdown',
        semi: false,
        singleQuote: true,
        proseWrap: 'never',
        pluginSearchDirs: [],
        plugins: [],
      }
    )
    const [start, end] = markers('usage')
    const usage = rendered.slice(
      rendered.indexOf(start) + start.length,
      rendered.indexOf(end)
    )
    if (!rendered.includes(start) || !rendered.includes(end))
      throw new Error('Template needs usage markers.')
    add(
      destination,
      before,
      before === undefined ? rendered : replaceRegion(before, 'usage', usage)
    )
  }
  const table = [
    '| Package | Status | Description |',
    '| --- | --- | --- |',
    ...plugins
      .filter(({ pkg }) => !pkg.private)
      .map(({ directory, pkg }) => {
        const repo =
          (typeof pkg.repository === 'string'
            ? pkg.repository
            : pkg.repository?.url) ?? 'https://github.com/bytedance/bytemd.git'
        const url = repo.replace(/^git\+/, '').replace(/\.git$/, '')
        const description = _.upperFirst(
          (pkg.description ?? '').replace(/^ByteMD plugin to /, '')
        )
          .replace(/\r?\n/g, ' ')
          .replace(/\|/g, '\\|')
        return `| [${pkg.name}](${url}/tree/main/packages/${directory}) | [![npm](https://img.shields.io/npm/v/${pkg.name}.svg?label=)](https://npm.im/${pkg.name}) | ${description} |`
      }),
  ].join('\n')
  for (const destination of [
    'README.md',
    'docs/index.md',
    'packages/bytemd/README.md',
  ]) {
    const before = await read(destination)
    if (before === undefined) continue
    if (!before.includes(markers('plugins')[0])) preservedDocs.push(destination)
    add(destination, before, replaceRegion(before, 'plugins', table))
  }
  return { root, changes, preservedDocs }
}

export async function applyGeneration(plan) {
  // Check all preconditions before applying; do not overwrite edits made since planning.
  for (const change of plan.changes) {
    const destination = path.join(plan.root, change.path)
    let current
    try {
      await checkParent(plan.root, destination)
      if ((await fs.lstat(destination)).isSymbolicLink())
        throw new Error(`Symlink destination: ${change.path}`)
      current = await fs.readFile(destination, 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (current !== change.before)
      throw new Error(`Changed since planning: ${change.path}`)
  }
  for (const { path: relative, after } of plan.changes)
    await fs.writeFile(path.join(plan.root, relative), after)
}

export async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== '--check'))
    throw new Error('Usage: pnpm generate [--check]')
  const plan = await planGeneration()
  if (!args.includes('--check')) await applyGeneration(plan)
  console.log(
    JSON.stringify(
      {
        mode: args.includes('--check') ? 'check' : 'write',
        changes: plan.changes.map(({ path }) => path),
        preservedDocs: plan.preservedDocs,
      },
      null,
      2
    )
  )
  if (args.includes('--check') && plan.changes.length) process.exitCode = 1
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
