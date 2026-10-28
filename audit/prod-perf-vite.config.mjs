import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'
import sveltePreprocess from 'svelte-preprocess'
import { defineConfig } from 'vite'

const auditDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: auditDir,
  base: '/prod-perf/',
  resolve: { conditions: ['worker'] },
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
