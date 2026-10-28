<template>
  <div
    v-html="html"
    class="markdown-body"
    :aria-busy="pending"
    @click="handleClick"
    ref="markdownBody"
  ></div>
</template>

<script lang="ts">
import {
  defineComponent,
  computed,
  watch,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  Ref,
  nextTick,
} from 'vue'
import {
  addCopyButtons,
  copyCodeFromButton,
  renderMarkdown,
  createRenderController,
  renderPendingHtml,
  scrollToAnchor,
  renderErrorHtml,
  runViewerEffects,
  BytemdPlugin,
  RenderState,
} from 'bytemd/viewer'

export default defineComponent({
  props: [
    'value',
    'plugins',
    'sanitize',
    'remarkRehype',
    'headingIds',
    'locale',
    'renderer',
  ],
  setup(props, ctx) {
    const markdownBody: Ref<HTMLElement | null> = ref(null)
    let cleanupEffects: (() => void) | undefined
    let active = true
    let effectVersion = 0
    let mounted = false
    let controller: ReturnType<typeof createRenderController> | undefined
    const asyncState = shallowRef<RenderState>()
    const asyncRequest = shallowRef<any>()
    const request = computed(() => ({
      value: props.value,
      plugins: props.plugins,
      sanitize: props.sanitize,
      remarkRehype: props.remarkRehype,
      headingIds: props.headingIds,
      renderer: props.renderer,
    }))
    const pending = computed(
      () =>
        !!props.renderer &&
        (asyncRequest.value !== request.value ||
          !asyncState.value ||
          asyncState.value.status === 'pending')
    )
    const file = computed(() => {
      if (props.renderer)
        return asyncRequest.value === request.value &&
          asyncState.value?.status === 'ready'
          ? asyncState.value.result.file
          : undefined
      try {
        return renderMarkdown(request.value).file
      } catch (error) {
        console.error(error)
      }
    })
    const html = computed(
      () =>
        file.value?.toString() ??
        (pending.value
          ? renderPendingHtml(props.locale)
          : renderErrorHtml(props.locale))
    )

    const needUpdate = computed(() => {
      return [
        file.value,
        props.plugins,
        props.sanitize,
        props.remarkRehype,
        props.locale,
      ]
    })

    watch(
      request,
      () => {
        if (!mounted) return
        controller?.destroy()
        if (props.renderer) startRender()
      },
      { deep: true }
    )

    function startRender() {
      off()
      asyncRequest.value = request.value
      controller = createRenderController((state) => {
        if (state.status === 'error') console.error(state.error)
        asyncState.value = state
      })
      controller.render(request.value, props.renderer)
    }

    watch(
      needUpdate,
      () => {
        off()
        const version = ++effectVersion
        nextTick(() => {
          if (active && version === effectVersion) on()
        })
      },
      { deep: true }
    )

    onMounted(() => {
      mounted = true
      if (props.renderer) startRender()
      else on()
    })

    onUnmounted(() => {
      active = false
      effectVersion++
      controller?.destroy()
      off()
    })

    const handleClick = (e: MouseEvent) => {
      const $ = e.target as HTMLElement
      if ($.classList?.contains('bytemd-copy-btn')) {
        copyCodeFromButton($ as HTMLButtonElement)
        return
      }
      if (markdownBody.value) scrollToAnchor(markdownBody.value, e)
    }

    const off = () => {
      cleanupEffects?.()
      cleanupEffects = undefined
    }

    const on = () => {
      if (!active || !markdownBody.value || !file.value) return
      addCopyButtons(markdownBody.value, props.locale)
      cleanupEffects = runViewerEffects(
        markdownBody.value,
        file.value,
        props.plugins as BytemdPlugin[] | undefined,
        props.locale
      )
    }

    return { markdownBody, html, handleClick, pending }
  },
})
</script>
