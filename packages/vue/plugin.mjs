import vue2 from '@vitejs/plugin-vue2'
import { createRequire } from 'node:module'

// The monorepo also contains Vue 3. Resolve the compiler from this workspace,
// otherwise the plugin can find the root's hoisted Vue 3 compiler.
const require = createRequire(import.meta.url)
export function createVuePlugin(options = {}) {
  return vue2({ compiler: require('vue/compiler-sfc'), ...options })
}
