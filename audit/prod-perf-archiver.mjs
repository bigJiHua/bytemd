import { writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'

export class EvidenceConflictError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EvidenceConflictError'
  }
}

const BATCH7_PREFIXES = [
  'prod-perf-',
  'ime-',
  'heap-',
  'mobile-',
  'cost-',
  'build-prod-perf-',
]

const PRIOR_BATCH_PREFIXES = [
  'performance-',
  'worker-',
  'scroll-',
  'plugin-',
  'generation-',
  'repair-',
  'build-',
  'benchmark',
  'core.',
  'framework.',
  'dependencies',
  'probe-',
  'regression-',
  'ui-',
  'lightbox-',
  'vitest.',
]

export class EvidenceArchiver {
  constructor(auditDir) {
    this.auditDir = auditDir
    mkdirSync(auditDir, { recursive: true })
    this._baseline = this._scanBaseline()
    this._log = []
  }

  _scanBaseline() {
    const files = existsSync(this.auditDir) ? readdirSync(this.auditDir) : []
    return new Set(files)
  }

  checkConflict(filename) {
    const base = basename(filename)
    if (this._baseline.has(base)) return true
    if (!BATCH7_PREFIXES.some((p) => base.startsWith(p))) return true
    return false
  }

  async archive(content, filename) {
    const base = basename(filename)
    if (!BATCH7_PREFIXES.some((p) => base.startsWith(p))) {
      throw new EvidenceConflictError(
        `Filename must start with a batch-7 prefix: ${base}`,
      )
    }
    if (this._baseline.has(base)) {
      throw new EvidenceConflictError(
        `File already exists (prior batch): ${base}`,
      )
    }
    const fullPath = join(this.auditDir, base)
    if (existsSync(fullPath)) {
      throw new EvidenceConflictError(`File already exists: ${base}`)
    }
    const buf =
      typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
    writeFileSync(fullPath, buf, { flag: 'wx' })
    this._log.push({
      filename: base,
      size: buf.length,
      prefix: BATCH7_PREFIXES.find((p) => base.startsWith(p)),
      timestamp: new Date().toISOString(),
    })
    return fullPath
  }

  getLog() {
    return [...this._log]
  }

  static getPrefixes() {
    return { batch7: BATCH7_PREFIXES, prior: PRIOR_BATCH_PREFIXES }
  }
}
