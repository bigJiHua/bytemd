<template>
  <div
    class="markdown-body"
    :aria-busy="pending"
    v-html="html"
    @click="handleClick($event)"
  ></div>
</template>

<script>
import {
  addCopyButtons,
  copyCodeFromButton,
  renderMarkdown,
  createRenderController,
  renderPendingHtml,
  scrollToAnchor,
  renderErrorHtml,
  runViewerEffects,
} from 'bytemd/viewer'

export default {
  props: [
    'value',
    'plugins',
    'sanitize',
    'remarkRehype',
    'headingIds',
    'locale',
    'renderer',
  ],
  data() {
    return {
      destroyed: false,
      effectVersion: 0,
      ready: false,
      asyncRequest: undefined,
      asyncState: undefined,
    }
  },
  computed: {
    request() {
      return {
        value: this.value,
        plugins: this.plugins,
        sanitize: this.sanitize,
        remarkRehype: this.remarkRehype,
        headingIds: this.headingIds,
        renderer: this.renderer,
      }
    },
    pending() {
      return (
        !!this.renderer &&
        (this.asyncRequest !== this.request ||
          !this.asyncState ||
          this.asyncState.status === 'pending')
      )
    },
    file() {
      if (this.renderer)
        return this.asyncRequest === this.request &&
          this.asyncState?.status === 'ready'
          ? this.asyncState.result.file
          : undefined
      try {
        return renderMarkdown(this.request).file
      } catch (err) {
        console.error(err)
      }
    },
    html() {
      return (
        this.file?.toString() ??
        (this.pending
          ? renderPendingHtml(this.locale)
          : renderErrorHtml(this.locale))
      )
    },
    needUpdate() {
      return [
        this.file,
        this.plugins,
        this.sanitize,
        this.remarkRehype,
        this.locale,
      ]
    },
  },
  watch: {
    request: {
      deep: true,
      handler() {
        if (!this.ready) return
        this.renderController?.destroy()
        if (!this.renderer) return
        this.startRender()
      },
    },
    needUpdate: {
      handler(val) {
        this.off()
        const version = ++this.effectVersion
        this.$nextTick(() => {
          if (!this.destroyed && version === this.effectVersion) this.on()
        })
      },
      deep: true,
    },
  },
  mounted() {
    this.ready = true
    if (this.renderer) this.startRender()
    else this.on()
  },
  beforeDestroy() {
    this.destroyed = true
    this.effectVersion++
    this.renderController?.destroy()
    this.off()
  },
  methods: {
    startRender() {
      this.off()
      this.asyncRequest = this.request
      this.renderController = createRenderController((state) => {
        if (state.status === 'error') console.error(state.error)
        // Do not recursively observe large HAST/VFile graphs in Vue 2.
        this.asyncState = Object.freeze(state)
      })
      this.renderController.render(this.request, this.renderer)
    },
    on() {
      if (this.destroyed || !this.file) return
      addCopyButtons(this.$el, this.locale)
      this.cleanupEffects = runViewerEffects(
        this.$el,
        this.file,
        this.plugins,
        this.locale
      )
    },
    off() {
      this.cleanupEffects?.()
      this.cleanupEffects = undefined
    },
    handleClick(e) {
      const $ = e.target
      if ($.classList?.contains('bytemd-copy-btn')) {
        copyCodeFromButton($)
        return
      }
      scrollToAnchor(this.$el, e)
    },
  },
}
</script>
