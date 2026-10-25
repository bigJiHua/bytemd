// @ts-check
import { packages, packagesDir } from './utils.mjs'
import fs from 'fs-extra'
import path from 'path'

for (const name of packages) {
  for (const output of ['tsconfig.tsbuildinfo', 'dist']) {
    const target = path.join(packagesDir, name, output)
    const relative = path.relative(packagesDir, target)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Build output outside packages: ${target}`)
    }
    fs.removeSync(target)
  }
}
