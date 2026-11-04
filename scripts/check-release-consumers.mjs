import { rootDir } from './publish-jihua.mjs'
import { execa } from 'execa'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const releaseDir = path.resolve(process.argv[2] ?? '')
const release = JSON.parse(
  await fs.readFile(path.join(releaseDir, 'release.json'), 'utf8'),
)
const tarballs = Object.fromEntries(
  release.packages.map((pkg) => [
    pkg.name,
    'file:' + path.join(releaseDir, pkg.filename),
  ]),
)
const output = await fs.mkdtemp(
  path.join(rootDir, 'audit/prod-perf-release-consumers-'),
)
const checks = []
const plugins = Object.fromEntries(
  Object.entries(tarballs).filter(([name]) =>
    name.startsWith('@jihua/bytemd-plugin-'),
  ),
)
const cases = [
  {
    name: 'core',
    dependencies: { '@jihua/bytemd': tarballs['@jihua/bytemd'] },
    code: String.raw`
    import * as core from '@jihua/bytemd';
    import { renderMarkdown } from '@jihua/bytemd/processor';
    import { installWorkerRenderer } from '@jihua/bytemd/worker';
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    assert.equal(typeof core.Editor, 'function');
    assert.equal(typeof require('@jihua/bytemd').Viewer, 'function');
    assert.equal(typeof installWorkerRenderer, 'function');
    assert.match(renderMarkdown({value:'# Clean consumer'}).file.toString(), /<h1/);
    assert.equal(typeof globalThis.document, 'undefined');
    assert.ok(require.resolve('svelte/package.json').startsWith(process.cwd()));
  `,
  },
  {
    name: 'plugins',
    dependencies: { bytemd: tarballs['@jihua/bytemd'], ...plugins },
    code: String.raw`
    import { renderMarkdown } from 'bytemd/processor';
    import gfm from '@jihua/bytemd-plugin-gfm';
    import math from '@jihua/bytemd-plugin-math-ssr';
    import highlight from '@jihua/bytemd-plugin-highlight-ssr';
    const html = renderMarkdown({value:'~~removed~~\n\n$x^2$\n\n\x60\x60\x60js\nconst n=1\n\x60\x60\x60',plugins:[gfm(),math(),highlight()]}).file.toString();
    assert.match(html, /<del>removed<\/del>/);
    assert.match(html, /katex/);
    assert.match(html, /hljs/);
  `,
  },
  {
    name: 'react',
    dependencies: {
      bytemd: tarballs['@jihua/bytemd'],
      '@jihua/bytemd-react': tarballs['@jihua/bytemd-react'],
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    code: String.raw`
    import React from 'react';
    import { renderToString } from 'react-dom/server';
    import { Viewer } from '@jihua/bytemd-react';
    assert.match(renderToString(React.createElement(Viewer,{value:'# React consumer'})), /React consumer/);
  `,
  },
  {
    name: 'vue2',
    dependencies: {
      bytemd: tarballs['@jihua/bytemd'],
      '@jihua/bytemd-vue': tarballs['@jihua/bytemd-vue'],
      vue: '^2.7.14',
      'vue-server-renderer': '^2.7.14',
    },
    code: String.raw`
    import Vue from 'vue';
    import renderer from 'vue-server-renderer';
    import { Viewer } from '@jihua/bytemd-vue';
    assert.match(await renderer.createRenderer().renderToString(new Vue({render:h=>h(Viewer,{props:{value:'# Vue2 consumer'}})})), /Vue2 consumer/);
  `,
  },
  {
    name: 'vue3',
    dependencies: {
      bytemd: tarballs['@jihua/bytemd'],
      '@jihua/bytemd-vue-next': tarballs['@jihua/bytemd-vue-next'],
      vue: '^3.5.0',
      '@vue/server-renderer': '^3.5.0',
    },
    code: String.raw`
    import {createSSRApp,h} from 'vue';
    import {renderToString} from '@vue/server-renderer';
    import {Viewer} from '@jihua/bytemd-vue-next';
    assert.match(await renderToString(createSSRApp({render:()=>h(Viewer,{value:'# Vue3 consumer'})})), /Vue3 consumer/);
  `,
  },
]
for (const test of cases) {
  const directory = await fs.mkdtemp(
    path.join(tmpdir(), `bytemd-release-${test.name}-`),
  )
  assert.ok(
    !directory.startsWith(rootDir),
    'Consumers must not inherit workspace node_modules',
  )
  const record = { name: test.name, directory, status: 'pending' }
  checks.push(record)
  try {
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify(
        { private: true, type: 'module', dependencies: test.dependencies },
        null,
        2,
      ),
    )
    const installed = await execa(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--registry=https://registry.npmjs.org',
      ],
      { cwd: directory },
    )
    await fs.writeFile(
      path.join(output, `${test.name}-install.log`),
      installed.stdout + '\n' + installed.stderr,
    )
    await fs.writeFile(
      path.join(directory, 'check.mjs'),
      "import assert from 'node:assert/strict';\n" + test.code,
    )
    await execa('node', ['check.mjs'], { cwd: directory })
    record.status = 'passed'
  } catch (error) {
    record.status = 'failed'
    record.error = error.stderr || error.message
    process.exitCode = 1
  }
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify({ releaseDir, version: release.version, checks }, null, 2),
  )
  console.log(JSON.stringify(record))
}
console.log(`Release consumer evidence: ${output}`)
