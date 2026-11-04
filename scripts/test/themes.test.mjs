import {
  officialThemes,
  renderAllThemesCss,
  renderManifest,
  renderThemeCss,
} from '../../packages/bytemd/themes.config.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

test('official theme ids are unique kebab-case with labels', () => {
  const ids = officialThemes.map((t) => t.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const t of officialThemes) {
    assert.match(t.id, /^[a-z0-9-]+$/)
    assert.ok(t.label.length > 0)
    assert.equal(typeof t.dark, 'boolean')
  }
})

test('every theme token is an --md-* custom property with a string value', () => {
  for (const t of officialThemes) {
    assert.ok(Object.keys(t.tokens).length >= 10, `${t.id} too sparse`)
    for (const [name, value] of Object.entries(t.tokens)) {
      assert.match(name, /^--md-[a-z-]+$/)
      assert.equal(typeof value, 'string')
      assert.ok(value.length > 0)
    }
  }
})

test('every theme declares the chromatic identity tokens', () => {
  const core = [
    '--md-text',
    '--md-muted',
    '--md-accent',
    '--md-link',
    '--md-code-bg',
  ]
  for (const t of officialThemes) {
    for (const name of core) {
      assert.ok(t.tokens[name], `${t.id} missing ${name}`)
    }
  }
})

test('semantic callout hues stay constant across light themes', () => {
  const lights = officialThemes.filter((t) => !t.dark)
  for (const t of lights) {
    for (const [name, value] of Object.entries(t.tokens)) {
      assert.ok(
        !name.startsWith('--md-callout-'),
        `${t.id} should not override semantic callout colors`,
      )
      assert.ok(
        !name.startsWith('--md-timeline-'),
        `${t.id} should not override semantic timeline colors`,
      )
    }
  }
})

test('the dark theme carries dark callout and timeline overrides', () => {
  const dark = officialThemes.filter((t) => t.dark)
  assert.equal(dark.length, 1)
  assert.ok(dark[0].tokens['--md-callout-default-bg'])
  assert.ok(dark[0].tokens['--md-timeline-line'])
})

test('renderThemeCss emits a .markdown-body token preset', () => {
  const css = renderThemeCss(officialThemes[0])
  assert.ok(css.startsWith('/*'))
  assert.ok(css.includes('.markdown-body {'))
  assert.ok(
    css.includes(`--md-accent: ${officialThemes[0].tokens['--md-accent']};`),
  )
  assert.ok(!css.includes('data-bytemd-theme'))
})

test('renderAllThemesCss scopes every theme behind data-bytemd-theme', () => {
  const css = renderAllThemesCss(officialThemes)
  for (const t of officialThemes) {
    assert.ok(
      css.includes(`.markdown-body:where([data-bytemd-theme='${t.id}'])`),
    )
  }
  assert.equal(
    css.split('\n.markdown-body:where([data-bytemd-theme=').length - 1,
    officialThemes.length,
  )
})

test('dark themes paint their own canvas for light hosts', () => {
  const dark = officialThemes.filter((t) => t.dark)
  for (const t of dark) {
    const css = renderThemeCss(t)
    assert.ok(css.includes('background-color: var(--md-surface);'))
    assert.ok(css.includes('color-scheme: dark;'))
    const all = renderAllThemesCss([t])
    assert.ok(all.includes('background-color: var(--md-surface);'))
  }
  for (const t of officialThemes.filter((x) => !x.dark)) {
    assert.ok(!renderThemeCss(t).includes('background-color:'))
  }
})

test('renderManifest lists id/label/dark for every theme', () => {
  const manifest = JSON.parse(renderManifest(officialThemes))
  assert.equal(manifest.version, 1)
  assert.deepEqual(
    manifest.themes.map((t) => t.id),
    officialThemes.map((t) => t.id),
  )
})

test('built theme artifacts exist and match the source palettes', (t) => {
  const themesDir = path.join(root, 'packages', 'bytemd', 'dist', 'themes')
  if (!fs.existsSync(themesDir))
    return t.skip('Run pnpm build to verify generated theme artifacts')
  for (const t of officialThemes) {
    const css = fs.readFileSync(path.join(themesDir, `${t.id}.css`), 'utf8')
    assert.ok(css.includes(`--md-accent: ${t.tokens['--md-accent']};`))
    assert.ok(fs.existsSync(path.join(themesDir, `${t.id}.min.css`)))
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(themesDir, 'manifest.json'), 'utf8'),
  )
  assert.equal(manifest.themes.length, officialThemes.length)
})
