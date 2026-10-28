// @ts-check
import { createVue3Plugin } from './packages/vue-next/plugin.mjs'
import { createVuePlugin } from './packages/vue/plugin.mjs'
import { sveltePreprocessor } from './scripts/utils.mjs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

// Both Vue plugins process virtual template requests regardless of `include`.
// Keep each compiler's load/transform hooks within its own workspace.
function scopedVuePlugin(plugin, workspace) {
  const prefix = `/packages/${workspace}/`
  const belongs = (id) => id.replace(/\\/g, '/').includes(prefix)
  const { load, transform } = plugin
  return {
    ...plugin,
    load(id, ...args) {
      if (id.includes('.vue') && !belongs(id)) return
      return load?.call(this, id, ...args)
    },
    transform(code, id, ...args) {
      if (!belongs(id)) return
      return transform?.call(this, code, id, ...args)
    },
  }
}

export default defineConfig({
  // Vitest resolves modules with Node conditions by default. Svelte's
  // "node" export is the SSR runtime, where onMount/afterUpdate are no-ops.
  resolve: {
    conditions: ['browser', 'module', 'import'],
    alias: {
      mermaid: fileURLToPath(
        new URL(
          './packages/plugin-mermaid/node_modules/mermaid/dist/mermaid.core.mjs',
          import.meta.url
        )
      ),
      'bytemd/viewer': fileURLToPath(
        new URL('./packages/bytemd/src/viewer.ts', import.meta.url)
      ),
      bytemd: fileURLToPath(
        new URL('./packages/bytemd/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    include: ['packages/{bytemd,react,vue,vue-next}/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'jsdom',
    // vitest 2+ defaults to a forks pool; the heavy jsdom suites need the
    // faster threads pool the 0.x/1.x lines used.
    pool: 'threads',
    // The 100-cycle framework lifecycle and wide-input budget suites run
    // slower under the vitest 3 runtime; keep a generous per-test budget.
    testTimeout: 20000,
    setupFiles: 'packages/bytemd/test/setup.ts',
    // Keep dynamic plugin imports inside Vite's module graph. Vitest 1
    // externalizes node_modules deps and their native imports would bypass
    // the vi.mock factories that simulate KaTeX/highlight behavior.
    server: {
      deps: {
        inline: ['katex', 'highlight.js'],
      },
    },
  },
  plugins: [
    svelte({
      preprocess: [sveltePreprocessor],
    }),
    scopedVuePlugin(createVuePlugin(), 'vue'),
    scopedVuePlugin(createVue3Plugin(), 'vue-next'),
    {
      name: 'bytemd-test-vue-versions',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id !== 'vue' || !importer) return
        // The Vue 3 plugin deduplicates Vue to the root. These workspaces
        // need separate runtimes so Vue 2 and Vue 3 can be tested together.
        const source = importer.replace(/\\/g, '/')
        const runtime = source.includes('/packages/vue-next/')
          ? './packages/vue-next/node_modules/vue/dist/vue.runtime.esm-bundler.js'
          : source.includes('/packages/vue/')
          ? './packages/vue/node_modules/vue/dist/vue.runtime.esm.js'
          : undefined
        // Resolve pnpm's symlink so nested @vue imports use that Vue runtime's
        // dependency directory, including under Vite 4.5's resolver.
        if (runtime)
          return realpathSync(fileURLToPath(new URL(runtime, import.meta.url)))
      },
    },
  ],
})
