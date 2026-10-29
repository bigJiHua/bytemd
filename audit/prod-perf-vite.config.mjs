import { svelte } from '@sveltejs/vite-plugin-svelte'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import sveltePreprocess from 'svelte-preprocess'
import { defineConfig } from 'vite'

const auditDir = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)
// DOM-free decoder for both the main and worker bundles: a global
// `resolve.conditions: ['worker']` cannot be used here because svelte 5
// exports a "worker" condition that maps to its server runtime, while the
// worker build's "browser" condition would otherwise pull the DOM-based
// `decode-named-character-reference` variant.
const domFreeDecoder = require.resolve('decode-named-character-reference')

export default defineConfig({
  root: auditDir,
  base: '/prod-perf/',
  resolve: {
    alias: {
      'decode-named-character-reference': domFreeDecoder,
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/worker-[name]-[hash].js',
        chunkFileNames: 'assets/worker-[name]-[hash].js',
      },
    },
  },
  build: {
    outDir: 'dist-prod-perf',
    rollupOptions: {
      input: fileURLToPath(new URL('./prod-perf-ui.html', import.meta.url)),
    },
  },
  plugins: [svelte({ preprocess: [sveltePreprocess({ typescript: true })] })],
})
