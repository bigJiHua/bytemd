<template>
  <div></div>
</template>

<script>
import * as bytemd from 'bytemd'

export default {
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
  mounted() {
    const editor = new bytemd.Editor({
      target: this.$el,
      props: this.$props,
    })
    this.unsubscribe = editor.$on('change', (e) => {
      this.$emit('change', e.detail.value)
    })
    this.editor = editor
  },
  beforeDestroy() {
    this.unsubscribe?.()
    this.editor?.$destroy()
    this.editor = undefined
  },
  watch: {
    $props: {
      handler(newValue, oldValue) {
        this.editor?.$set({ ...newValue })
      },
      deep: true,
    },
  },
}
</script>
