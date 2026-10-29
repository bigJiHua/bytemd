import mediumZoom from '../../plugin-medium-zoom/src'
import {
  createApp,
  h,
  nextTick,
  ref,
} from '../../vue-next/node_modules/vue/dist/vue.runtime.esm-bundler.js'
import Vue3Editor from '../../vue-next/src/editor.vue'
import Vue2 from '../../vue/node_modules/vue/dist/vue.runtime.esm.js'
import Vue2Editor from '../../vue/src/editor.vue'
import { getProcessor } from '../src'
import { tick } from 'svelte'

test('Vue 2 editor cleans up across 100 mount/unmount cycles', async () => {
  const off = vi.fn()
  const effect = vi.fn(() => off)
  for (let cycle = 0; cycle < 100; cycle++) {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const app = new Vue2({
      render: (h: any) =>
        h(Vue2Editor, {
          props: { value: '', plugins: [{ editorEffect: effect }] },
        }),
    }).$mount(element)
    await Vue2.nextTick()
    await Promise.resolve()
    expect(effect).toHaveBeenCalledTimes(cycle + 1)
    app.$destroy()
    app.$el.remove()
    expect(off).toHaveBeenCalledTimes(cycle + 1)
  }
}, 120000)

test('Vue 2 editor resets removed optional props and plugin effects', async () => {
  const off = vi.fn()
  const effect = vi.fn(() => off)
  const element = document.createElement('div')
  document.body.append(element)
  const app = new Vue2({
    data: () => ({
      options: {
        value: 'long',
        maxLength: 1,
        layoutContainment: true,
        overridePreview: () => {},
        plugins: [{ editorEffect: effect }],
      } as any,
    }),
    render(h: any) {
      return h(Vue2Editor, { props: this.options })
    },
  }).$mount(element)
  await Vue2.nextTick()
  await tick()
  expect(effect).toHaveBeenCalledTimes(1)
  expect(app.$el.querySelector('.bytemd-status-error')).not.toBeNull()
  expect(app.$el.querySelector('.markdown-body')).toBeNull()
  expect(app.$el.querySelector('.bytemd-body-contained')).not.toBeNull()
  app.options = { value: 'long' }
  await Vue2.nextTick()
  await tick()
  expect(app.$el.querySelector('.bytemd-status-error')).toBeNull()
  expect(app.$el.querySelector('.markdown-body')).not.toBeNull()
  expect(app.$el.querySelector('.bytemd-body-contained')).toBeNull()
  expect(off).toHaveBeenCalledTimes(1)
  app.$destroy()
  app.$el.remove()
  expect(off).toHaveBeenCalledTimes(1)
})

test('Vue 3 editor resets removed optional props and plugin effects', async () => {
  const off = vi.fn()
  const effect = vi.fn(() => off)
  const options = ref<any>({
    value: 'long',
    maxLength: 1,
    layoutContainment: true,
    overridePreview: () => {},
    plugins: [{ editorEffect: effect }],
  })
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(Vue3Editor, options.value) })
  app.mount(element)
  await nextTick()
  await tick()
  expect(effect).toHaveBeenCalledTimes(1)
  expect(element.querySelector('.bytemd-status-error')).not.toBeNull()
  expect(element.querySelector('.markdown-body')).toBeNull()
  expect(element.querySelector('.bytemd-body-contained')).not.toBeNull()
  options.value = { value: 'long' }
  await nextTick()
  await tick()
  expect(element.querySelector('.bytemd-status-error')).toBeNull()
  expect(element.querySelector('.markdown-body')).not.toBeNull()
  expect(element.querySelector('.bytemd-body-contained')).toBeNull()
  expect(off).toHaveBeenCalledTimes(1)
  app.unmount()
  element.remove()
  expect(off).toHaveBeenCalledTimes(1)
})

test('unmounting an open lightbox clears overlays without affecting another viewer', async () => {
  const file = getProcessor({}).processSync('')
  const a = document.createElement('div')
  const b = document.createElement('div')
  a.innerHTML = '<img src="lightbox-a.png" alt="A">'
  b.innerHTML = '<img src="lightbox-b.png" alt="B">'
  document.body.append(a, b)
  const stopA = mediumZoom().viewerEffect!({ markdownBody: a, file })
  const stopB = mediumZoom({ background: 'rgb(1, 2, 3)' }).viewerEffect!({
    markdownBody: b,
    file,
  })
  await new Promise((resolve) => setTimeout(resolve, 100))
  a.querySelector('img')!.click()
  expect(
    document.querySelector('[role="dialog"]')?.getAttribute('aria-label'),
  ).toBe('A')
  stopA?.()
  expect(document.querySelector('.medium-zoom-overlay')).toBeNull()
  expect(document.querySelector('.medium-zoom-image--opened')).toBeNull()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(b.querySelector('img')?.classList.contains('medium-zoom-image')).toBe(
    true,
  )
  b.querySelector('img')!.click()
  expect(
    document.querySelector('[role="dialog"]')?.getAttribute('aria-label'),
  ).toBe('B')
  expect(
    (document.querySelector('.medium-zoom-overlay') as HTMLElement).style
      .background,
  ).toBe('rgb(1, 2, 3)')
  stopB?.()
  expect(document.querySelector('.medium-zoom-overlay')).toBeNull()
  expect(document.body.style.overflow).toBe('')
  a.remove()
  b.remove()
})

test('lightbox cleanup before import finishes prevents initialization', async () => {
  const root = document.createElement('div')
  root.innerHTML = '<img src="pending.png">'
  document.body.append(root)
  const stop = mediumZoom().viewerEffect!({
    markdownBody: root,
    file: getProcessor({}).processSync(''),
  })
  stop?.()
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(root.querySelector('.medium-zoom-image')).toBeNull()
  root.remove()
})

test('Vue 3 editor cleans up across 100 mount/unmount cycles', async () => {
  const off = vi.fn()
  const effect = vi.fn(() => off)
  for (let cycle = 0; cycle < 100; cycle++) {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const app = createApp({
      render: () =>
        h(Vue3Editor, { value: '', plugins: [{ editorEffect: effect }] }),
    })
    app.mount(element)
    await nextTick()
    await Promise.resolve()
    expect(effect).toHaveBeenCalledTimes(cycle + 1)
    app.unmount()
    element.remove()
    expect(off).toHaveBeenCalledTimes(cycle + 1)
  }
}, 120000)

test('Vue 3 editor exposes maxLength like the core editor', () => {
  expect((Vue3Editor as any).props).toHaveProperty('maxLength')
})

test('Vue editors expose overridePreview like the core editor', () => {
  expect((Vue2Editor as any).props).toHaveProperty('overridePreview')
  expect((Vue3Editor as any).props).toHaveProperty('overridePreview')
})

test('sharing one mediumZoom plugin keeps viewer cleanup isolated', async () => {
  const plugin = mediumZoom()
  const a = document.createElement('div')
  const b = document.createElement('div')
  a.innerHTML = '<img src="audit-a.png">'
  b.innerHTML = '<img src="audit-b.png">'
  document.body.append(a, b)
  const file = getProcessor({}).processSync('')
  const stopA = plugin.viewerEffect!({ markdownBody: a, file })
  await new Promise((resolve) => setTimeout(resolve, 100))
  const stopB = plugin.viewerEffect!({ markdownBody: b, file })
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(a.querySelector('img')?.classList.contains('medium-zoom-image')).toBe(
    true,
  )
  expect(b.querySelector('img')?.classList.contains('medium-zoom-image')).toBe(
    true,
  )
  try {
    stopA?.()
    expect(
      b.querySelector('img')?.classList.contains('medium-zoom-image'),
    ).toBe(true)
    expect(
      a.querySelector('img')?.classList.contains('medium-zoom-image'),
    ).toBe(false)
  } finally {
    stopB?.()
    a.remove()
    b.remove()
  }
})
