<template>
  <div ref="el"></div>
</template>

<script lang="ts">
import {
  defineComponent,
  onMounted,
  onBeforeUnmount,
  Ref,
  ref,
  watch,
} from 'vue'
import { Editor } from 'bytemd'

export default defineComponent({
  props: {
    value: { type: String, default: '' },
    plugins: { type: Array, default: () => [] },
    sanitize: Function,
    remarkRehype: Object,
    headingIds: { type: [Boolean, Object], default: true },
    mode: { type: String, default: 'auto' },
    previewDebounce: { type: Number, default: 300 },
    layoutContainment: { type: Boolean, default: false },
    largeDocumentThreshold: { type: Number, default: 102400 },
    largeDocumentWarning: { type: Boolean, default: true },
    placeholder: String,
    editorConfig: Object,
    locale: Object,
    uploadImages: Function,
    maxLength: { type: Number, default: Infinity },
    overridePreview: Function,
    renderer: Function,
  },
  emits: ['change'],
  setup(props, { emit }) {
    const el: Ref<HTMLElement | null> = ref(null)
    // The Svelte 5 compat instance carries private fields; a deep `ref` proxy
    // would hide them from method receivers, so hold it non-reactively.
    let editor: Editor | null = null
    let unsubscribe: (() => void) | undefined

    watch(
      () => props,
      (newValue) => {
        editor?.$set({ ...newValue })
      },
      { deep: true }
    )

    onMounted(() => {
      const instance = new Editor({
        target: el.value!,
        props,
      })
      unsubscribe = instance.$on('change', (e) => {
        emit('change', e.detail.value)
      })
      editor = instance
    })

    onBeforeUnmount(() => {
      unsubscribe?.()
      editor?.$destroy()
      editor = null
    })

    return { el }
  },
})
</script>
