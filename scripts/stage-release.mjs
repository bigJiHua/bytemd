import { rootDir, rewriteManifest, mapPackageName } from './publish-jihua.mjs'
import { execa } from 'execa'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

// Pack the exact bytes that will be installed and published. Source manifests
// stay unchanged; all scope/alias rewriting uses the shared publishing module.
const output = await fs.mkdtemp(path.join(rootDir, 'audit/prod-perf-release-'))
const manifests = []
for (const name of await fs.readdir(path.join(rootDir, 'packages'))) {
  const source = path.join(rootDir, 'packages', name)
  const manifest = JSON.parse(
    await fs.readFile(path.join(source, 'package.json'), 'utf8'),
  )
  if (!manifest.private) manifests.push({ name, source, manifest })
}
const versions = Object.fromEntries(
  manifests.map(({ manifest }) => [manifest.name, manifest.version]),
)
const args = process.argv.slice(2)
assert.ok(
  args.every(
    (arg) => !arg.startsWith('--') || arg === '--allow-mixed-versions',
  ),
  'Unknown stage option',
)
const targets = args.filter((arg) => !arg.startsWith('--')).map(mapPackageName)
if (!args.includes('--allow-mixed-versions'))
  assert.equal(
    new Set(Object.values(versions)).size,
    1,
    'Release versions must match',
  )
const selected = manifests.filter(
  ({ manifest }) =>
    !targets.length || targets.includes(mapPackageName(manifest.name)),
)
assert.ok(selected.length, 'No release packages matched')
const report = {
  output,
  version:
    new Set(Object.values(versions)).size === 1
      ? Object.values(versions)[0]
      : null,
  packages: [],
}
for (const { name, source, manifest } of selected) {
  const destination = path.join(output, 'staging', name)
  await fs.mkdir(destination, { recursive: true })
  for (const file of [...manifest.files, 'LICENSE', 'README.md']) {
    await fs.cp(path.join(source, file), path.join(destination, file), {
      recursive: true,
    })
  }
  const rewritten = rewriteManifest(manifest, versions)
  assert.ok(!JSON.stringify(rewritten).includes('workspace:'))
  await fs.writeFile(
    path.join(destination, 'package.json'),
    JSON.stringify(rewritten, null, 2) + '\n',
  )
  const { stdout } = await execa(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', output],
    { cwd: destination },
  )
  const [packed] = JSON.parse(stdout)
  assert.equal(packed.name, rewritten.name)
  assert.equal(packed.version, manifest.version)
  report.packages.push({
    name: packed.name,
    version: packed.version,
    filename: packed.filename,
    integrity: packed.integrity,
    shasum: packed.shasum,
    size: packed.size,
    unpackedSize: packed.unpackedSize,
  })
  console.log(`${packed.name}@${packed.version}: ${packed.filename}`)
}
await fs.writeFile(
  path.join(output, 'release.json'),
  JSON.stringify(report, null, 2),
)
console.log(JSON.stringify(report))
