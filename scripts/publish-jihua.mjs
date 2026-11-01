import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const rootDir = fileURLToPath(new URL('..', import.meta.url))

/**
 * 发布期 @jihua 改写工具。
 *
 * 背景:AGENTS 纪律 3 要求树内保持上游包名(bytemd / @bytemd/*),npm 发布时才改名为
 * @jihua/*。1.22.0 首发是手工逐包改名 + `npm publish`,而 npm 不会改写 pnpm 的
 * workspace: 协议,导致 @jihua/bytemd-{vue,vue-next,react}@1.22.0 的
 * dependencies 里泄漏 `"bytemd"/"@jihua/bytemd": "workspace:*"`,npm 消费者安装
 * 直接报 `Unsupported URL Type "workspace:"`。
 *
 * 本脚本在一次运行内完成:备份 manifests → 改写(改名 + workspace 协议落成真实
 * 版本号)→ 逐包 `pnpm publish` → 还原 manifests(字节级),任何一步失败都会还原。
 * 中断兜底:备份落在 node_modules/.publish-jihua-backup.json,可用 --restore 恢复。
 *
 * 用法:
 *   node scripts/publish-jihua.mjs --dry-run                  # 全包演练,不联网不发版
 *   node scripts/publish-jihua.mjs @bytemd/vue @bytemd/vue-next @bytemd/react
 *   node scripts/publish-jihua.mjs                            # 全部包
 *   node scripts/publish-jihua.mjs --restore                  # 中断后手工还原
 * 前置:`pnpm build` 已产出 dist;真实发布需要本机 npm 登录态。
 */

const SCOPE = '@jihua'
const BACKUP_FILE = path.join(
  rootDir,
  'node_modules',
  '.publish-jihua-backup.json',
)
const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

/** bytemd 族包名 → @jihua 作用域名;其余(remark-gfm、vue 等)原样返回。 */
export function mapPackageName(name) {
  if (name === 'bytemd') return `${SCOPE}/bytemd`
  if (name.startsWith('@bytemd/'))
    return `${SCOPE}/bytemd-${name.slice('@bytemd/'.length)}`
  return name
}

/**
 * 改写一个 manifest。workspaceVersions 是「树内包名 → 真实版本」映射,
 * workspace: 协议按 pnpm publish 语义落成版本号(* → 精确,^/~ 保留前缀)。
 * 只改 name 与四个依赖字段;author/license/repository 等一律不动(纪律 3)。
 */
export function rewriteManifest(manifest, workspaceVersions) {
  const rewritten = { ...manifest }
  if (rewritten.name) rewritten.name = mapPackageName(rewritten.name)
  for (const field of DEP_FIELDS) {
    const deps = manifest[field]
    if (!deps) continue
    const mapped = {}
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        const version = workspaceVersions[name]
        if (!version)
          throw new Error(`workspace 依赖 ${name} 不在工作区内,无法解析版本`)
        const suffix = range.slice('workspace:'.length)
        mapped[mapPackageName(name)] =
          suffix === '*'
            ? version
            : suffix === ''
              ? version
              : `${suffix}${version}`
      } else {
        mapped[mapPackageName(name)] = range
      }
    }
    rewritten[field] = mapped
  }
  return rewritten
}

function listWorkspacePackages() {
  return fs
    .readdirSync(path.join(rootDir, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, 'packages', entry.name, 'package.json'))
    .filter((file) => fs.existsSync(file))
}

function readOriginals() {
  return listWorkspacePackages().map((file) => ({
    file,
    text: fs.readFileSync(file, 'utf8'),
  }))
}

function backup(originals) {
  fs.writeFileSync(
    BACKUP_FILE,
    JSON.stringify(originals.map(({ file, text }) => ({ file, text }))),
  )
}

function restore() {
  if (!fs.existsSync(BACKUP_FILE)) return false
  for (const { file, text } of JSON.parse(
    fs.readFileSync(BACKUP_FILE, 'utf8'),
  )) {
    fs.writeFileSync(file, text)
  }
  fs.rmSync(BACKUP_FILE)
  return true
}

async function alreadyPublished(name, version) {
  const registry = (
    process.env.npm_config_registry || 'https://registry.npmjs.org'
  ).replace(/\/$/, '')
  try {
    const response = await fetch(
      `${registry}/${name.replace('/', '%2F')}/${version}`,
    )
    return response.ok
  } catch {
    return false // 网络不可用时宁可让 publish 自己报重复版本,也不静默跳过
  }
}

function packOnlyPublish(dir, dryRun) {
  // pnpm publish 负责最终发布;若其不支持 --dry-run 则退化到 npm publish --dry-run。
  const command = dryRun
    ? `pnpm publish --no-git-checks --tag latest --dry-run || npm publish --tag latest --dry-run`
    : `pnpm publish --no-git-checks --tag latest`
  return execSync(command, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--restore')) {
    process.exitCode = (await restore()) ? 0 : 1
    console.log(
      process.exitCode === 0
        ? '[publish-jihua] 已从备份还原 manifests'
        : '[publish-jihua] 无备份可还原',
    )
    return
  }
  const dryRun = args.includes('--dry-run')
  const targets = args
    .filter((arg) => !arg.startsWith('--'))
    .map(mapPackageName)

  const originals = readOriginals()
  const manifests = originals.map(({ file, text }) => ({
    file,
    manifest: JSON.parse(text),
  }))
  const workspaceVersions = Object.fromEntries(
    manifests.map(({ manifest }) => [manifest.name, manifest.version]),
  )
  const selected = manifests.filter(({ manifest }) => {
    if (targets.length === 0) return true
    return (
      targets.includes(manifest.name) ||
      targets.includes(mapPackageName(manifest.name))
    )
  })
  if (selected.length === 0)
    throw new Error(`未匹配到包: ${targets.join(', ')}`)

  try {
    backup(originals)
    const results = []
    for (const { file, manifest } of selected) {
      const dir = path.dirname(file)
      const publishedName = mapPackageName(manifest.name)
      const rewritten = rewriteManifest(manifest, workspaceVersions)
      fs.writeFileSync(file, JSON.stringify(rewritten, null, 2) + '\n')
      try {
        if (
          !dryRun &&
          (await alreadyPublished(publishedName, manifest.version))
        ) {
          results.push(
            `${publishedName}@${manifest.version} → skip(已存在于 registry)`,
          )
          continue
        }
        packOnlyPublish(dir, dryRun)
        results.push(
          `${publishedName}@${manifest.version} → ${dryRun ? 'dry-run OK' : 'published'}`,
        )
      } catch (error) {
        const detail = String(error.stderr || error.message)
          .split('\n')
          .filter(Boolean)
          .slice(-2)
          .join(' | ')
        results.push(`${publishedName}@${manifest.version} → FAILED(${detail})`)
        process.exitCode = 1
      } finally {
        fs.writeFileSync(
          file,
          originals.find((original) => original.file === file).text,
        )
      }
    }
    console.log(results.join('\n'))
  } finally {
    restore()
  }
  if (dryRun)
    console.log(
      '[publish-jihua] dry-run 完成,manifests 已还原;真实发布去掉 --dry-run 重跑',
    )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main()
}
