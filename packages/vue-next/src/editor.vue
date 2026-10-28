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
    const editorRef: Ref<Editor | null> = ref(null)
    let unsubscribe: (() => void) | undefined

    watch(
      () => props,
      (newValue) => {
        editorRef.value?.$set({ ...newValue })
      },
      { deep: true }
    )

    onMounted(() => {
      const editor = new Editor({
        target: el.value!,
        props,
      })
      unsubscribe = editor.$on('change', (e) => {
        emit('change', e.detail.value)
      })
      editorRef.value = editor
    })

    onBeforeUnmount(() => {
      unsubscribe?.()
      editorRef.value?.$destroy()
      editorRef.value = null
    })

    return { el }
  },
})
</script>
