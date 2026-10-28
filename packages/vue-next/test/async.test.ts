import { createAsyncEditor } from '../src/async'
import '@testing-library/jest-dom'
import { renderToString } from '@vue/server-renderer'
import { createApp, defineComponent, h, nextTick } from 'vue'

const FakeEditor = defineComponent({
  name: 'FakeEditor',
  props: { value: { type: String, default: '' } },
  emits: ['change'],
  render() {
    return h('div', { class: 'fake-editor' }, this.value)
  },
})

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function mount(component: any, props: Record<string, unknown> = {}) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({
    render: () => h(component, props),
  })
  app.mount(el)
  return {
    el,
    unmount() {
      app.unmount()
      el.remove()
    },
  }
}

test('renders a placeholder, then the editor after the chunk resolves', async () => {
  const AsyncEditor = createAsyncEditor({
    loader: () => Promise.resolve({ default: FakeEditor }),
  })
  const view = mount(AsyncEditor, { value: 'hello' })
  expect(view.el.querySelector('.bytemd-async-placeholder')).toBeInTheDocument()
  expect(view.el.querySelector('.fake-editor')).toBeNull()

  await flush()
  expect(view.el.querySelector('.bytemd-async-placeholder')).toBeNull()
  expect(view.el.querySelector('.fake-editor')?.textContent).toBe('hello')
  view.unmount()
})

test('shows an error and retries after a failed load', async () => {
  let attempts = 0
  const AsyncEditor = createAsyncEditor({
    loader: () => {
      attempts += 1
      return attempts === 1
        ? Promise.reject(new Error('network down'))
        : Promise.resolve({ default: FakeEditor })
    },
  })
  const view = mount(AsyncEditor)
  await flush()
  const error = view.el.querySelector('.bytemd-async-error')
  expect(error).toBeInTheDocument()
  expect(error?.getAttribute('role')).toBe('alert')

  view.el.querySelector<HTMLButtonElement>('.bytemd-async-retry')!.click()
  await flush()
  expect(view.el.querySelector('.fake-editor')).toBeInTheDocument()
  expect(attempts).toBe(2)
  view.unmount()
})

test('times out a stalled chunk and ignores later resolution', async () => {
  let resolveLoader: (value: any) => void = () => {}
  const AsyncEditor = createAsyncEditor({
    timeout: 30,
    loader: () =>
      new Promise((resolve) => {
        resolveLoader = resolve
      }),
  })
  const view = mount(AsyncEditor)
  await new Promise((resolve) => setTimeout(resolve, 60))
  await flush()
  expect(view.el.querySelector('.bytemd-async-error')).toBeInTheDocument()

  resolveLoader({ default: FakeEditor })
  await flush()
  expect(view.el.querySelector('.fake-editor')).toBeNull()
  view.unmount()
})

test('ignores a chunk that resolves after unmount', async () => {
  let resolveLoader: (value: any) => void = () => {}
  const AsyncEditor = createAsyncEditor({
    loader: () =>
      new Promise((resolve) => {
        resolveLoader = resolve
      }),
  })
  const view = mount(AsyncEditor)
  view.unmount()
  resolveLoader({ default: FakeEditor })
  await flush()
  expect(document.querySelector('.fake-editor')).toBeNull()
})

// SSR placeholder behavior is covered by the Nuxt production SSR run.
