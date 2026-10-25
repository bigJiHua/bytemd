<template>
  <div
    v-html="file.toString()"
    className="markdown-body"
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
  Ref,
  nextTick,
} from 'vue'
import {
  addCopyButtons,
  copyCodeFromButton,
  getProcessor,
  BytemdPlugin,
} from 'bytemd'

export default defineComponent({
  props: ['value', 'plugins', 'sanitize', 'remarkRehype'],
  setup(props, ctx) {
    const markdownBody: Ref<HTMLElement | null> = ref(null)
    let cbs: ReturnType<NonNullable<BytemdPlugin['viewerEffect']>>[] = []
    const file = computed(() => {
      return getProcessor(props).processSync(props.value)
    })

    const needUpdate = computed(() => {
      return [file.value, props.plugins, props.sanitize, props.remarkRehype]
    })

    watch(
      needUpdate,
      () => {
        off()
        nextTick(() => {
          on()
        })
      },
      { deep: true }
    )

    onMounted(() => {
      on()
    })

    onUnmounted(() => {
      off()
    })

    const handleClick = (e: MouseEvent) => {
      const $ = e.target as HTMLElement
      if ($.classList?.contains('bytemd-copy-btn')) {
        copyCodeFromButton($ as HTMLButtonElement)
        return
      }
      if ($.tagName !== 'A') return

      const href = $.getAttribute('href')
      if (!href || !href.startsWith('#')) return

      const dest = (markdownBody.value as HTMLElement).querySelector(
        '#user-content-' + href.slice(1)
      )
      if (dest) dest.scrollIntoView()
    }

    const off = () => {
      cbs.forEach((cb) => cb?.())
      cbs = []
    }

    const on = () => {
      if (!markdownBody.value) return
      addCopyButtons(markdownBody.value)
      cbs =
        (props.plugins as BytemdPlugin[] | undefined)?.map(({ viewerEffect }) =>
          viewerEffect?.({
            markdownBody: markdownBody.value!,
            file: file.value,
          })
        ) ?? []
    }

    return { markdownBody, file, handleClick }
  },
})
</script>
