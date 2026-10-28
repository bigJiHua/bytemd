import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  type Component,
} from 'vue'

export interface AsyncEditorLoaderResult {
  default: Component
}

export interface AsyncEditorOptions {
  /** Custom module loader, mainly for tests or pre-bundled builds. */
  loader?: () => Promise<any>
  /** Load timeout in milliseconds. Defaults to 30000. */
  timeout?: number
}

/**
 * Editor loader that never runs during SSR: `onMounted` starts the request,
 * so the server only renders the sized placeholder below.
 */
export function createAsyncEditor({
  loader = () => import('./editor.vue'),
  timeout = 30000,
}: AsyncEditorOptions = {}) {
  return defineComponent({
    name: 'AsyncByteMDEditor',
    inheritAttrs: false,
    props: {
      /** Reserved height while the editor chunk loads; avoids layout shift. */
      placeholderHeight: { type: [Number, String], default: 360 },
      loadingText: { type: String, default: 'Loading editor…' },
      errorText: { type: String, default: 'Editor failed to load.' },
      retryText: { type: String, default: 'Retry' },
    },
    emits: ['ready', 'error'],
    setup(props, { attrs, emit, slots }) {
      const component = shallowRef<Component>()
      const failed = ref<unknown>()
      let active = true
      let timer: ReturnType<typeof setTimeout> | undefined
      let request = 0

      const clearTimer = () => {
        if (timer) clearTimeout(timer)
        timer = undefined
      }

      const start = () => {
        if (component.value || !active) return
        failed.value = undefined
        const current = ++request
        clearTimer()
        timer = setTimeout(() => {
          if (active && current === request && !component.value) {
            // Abandon this request so a late chunk cannot replace the error UI.
            request++
            failed.value = new Error('Editor load timed out.')
            emit('error', failed.value)
          }
        }, timeout)
        Promise.resolve()
          .then(loader)
          .then((module) => {
            if (!active || current !== request) return
            clearTimer()
            component.value = module.default
            emit('ready')
          })
          .catch((error) => {
            if (!active || current !== request) return
            clearTimer()
            failed.value = error
            emit('error', error)
          })
      }

      const retry = () => {
        if (!active) return
        failed.value = undefined
        start()
      }

      onMounted(start)
      onBeforeUnmount(() => {
        active = false
        request++
        clearTimer()
      })

      return () => {
        if (component.value)
          return h(component.value, { ...attrs, key: 'editor' })
        if (failed.value) {
          return h(
            'div',
            {
              class: 'bytemd-async-error',
              role: 'alert',
              style: {
                minHeight:
                  typeof props.placeholderHeight === 'number'
                    ? `${props.placeholderHeight}px`
                    : props.placeholderHeight,
              },
            },
            [
              h('p', props.errorText),
              h(
                'button',
                {
                  type: 'button',
                  class: 'bytemd-async-retry',
                  onClick: retry,
                },
                props.retryText
              ),
            ]
          )
        }
        return h(
          'div',
          {
            class: 'bytemd-async-placeholder',
            role: 'status',
            'aria-busy': 'true',
            style: {
              minHeight:
                typeof props.placeholderHeight === 'number'
                  ? `${props.placeholderHeight}px`
                  : props.placeholderHeight,
            },
          },
          slots.loading ? slots.loading() : [h('p', props.loadingText)]
        )
      }
    },
  })
}

/** Lazy-loaded Editor. Import from `@bytemd/vue-next/async` to keep it out
 * of the initial bundle; the placeholder reserves space during the request. */
export const AsyncEditor = createAsyncEditor()

export default AsyncEditor
