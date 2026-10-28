import App from './app.svelte'
import { mount } from 'svelte'

// Svelte 5 mounts with `mount()`; the Svelte 3 `new App(...)` form skips
// `init_operations`, so every compiled template helper stays undefined.
const app = mount(App, {
  target: document.body,
})

export default app
