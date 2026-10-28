import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'
import sveltePreprocess from 'svelte-preprocess'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/playground/',
  // decode-named-character-reference exposes a worker-safe conditional entry.
  resolve: { conditions: ['worker'] },
  worker: {
    format: 'es',
    // Vite 4 shares the emitted asset table with the main bundle.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/worker-[name]-[hash].js',
        chunkFileNames: 'assets/worker-[name]-[hash].js',
      },
    },
  },
  build: {
    outDir: '../audit/worker-production',
    rollupOptions: {
      input: fileURLToPath(
        new URL('../playground/worker-audit.html', import.meta.url)
      ),
    },
  },
  plugins: [svelte({ preprocess: [sveltePreprocess({ typescript: true })] })],
})
