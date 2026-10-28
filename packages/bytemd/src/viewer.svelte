<svelte:options immutable={true} />

<script lang="ts">
  import { createRenderController } from './render-controller'
  import type { SourceBlock } from './scroll'
  import type { ViewerProps as Props, BytemdPlugin } from './types'
  import { addCopyButtons, copyCodeFromButton, scrollToAnchor } from './utils'
  import { runViewerEffects } from './viewer-effects'
  import type { Root } from 'hast'
  import {
    tick,
    onDestroy,
    onMount,
    createEventDispatcher,
    afterUpdate,
    beforeUpdate,
  } from 'svelte'
  import type { VFile } from 'vfile'

  const dispatch = createEventDispatcher<{
    hast: { hast: Root; file?: VFile; blocks: SourceBlock[]; value: string }
  }>()

  export let value: Props['value'] = ''
  export let plugins: NonNullable<Props['plugins']> = []
  export let sanitize: Props['sanitize'] = undefined
  export let remarkRehype: Props['remarkRehype'] = undefined
  export let headingIds: Props['headingIds'] = undefined
  export let locale: Props['locale'] = undefined
  export let renderer: Props['renderer'] = undefined
  // Internal Editor integration; standalone Viewer HTML stays unchanged.
  export let sourceMap = false

  let markdownBody: HTMLElement
  let cleanupEffects: (() => void) | undefined
  let destroyed = false
  let mounted = false
  let renderVersion = 0

  function on() {
    if (!mounted || destroyed || !file) return
    // console.log('von')
    cleanupEffects = runViewerEffects(markdownBody, file, plugins, locale)
  }
  function off() {
    // console.log('voff')
    cleanupEffects?.()
    cleanupEffects = undefined
  }

  onMount(() => {
    mounted = true

    const handleClick = (e: MouseEvent) => {
      const $ = e.target as HTMLElement

      if ($.classList?.contains('bytemd-copy-btn')) {
        copyCodeFromButton($ as HTMLButtonElement)
        return
      }

      scrollToAnchor(markdownBody, e)
    }
    markdownBody.addEventListener('click', handleClick)
    return () => markdownBody.removeEventListener('click', handleClick)
  })

  onDestroy(() => {
    destroyed = true
    renderVersion++
    controller.destroy()
    off()
  })

  let file: VFile | undefined
  let appliedFile: VFile | undefined
  let appliedPlugins: BytemdPlugin[] | undefined
  let appliedLocale: Props['locale']
  let failed = false
  let i = 0

  let pending = !!renderer
  const controller = createRenderController((state) => {
    const version = ++renderVersion
    file = state.status === 'ready' ? state.result.file : undefined
    failed = state.status === 'error'
    pending = state.status === 'pending'
    i++
    if (state.status === 'error') console.error(state.error)
    const detail =
      state.status === 'ready'
        ? {
            hast: state.result.hast,
            file: state.result.file,
            blocks: state.result.blocks,
            value: state.result.value,
          }
        : {
            hast: { type: 'root' as const, children: [] },
            blocks: [],
            value: state.value,
          }
    tick().then(() => {
      if (!destroyed && version === renderVersion) dispatch('hast', detail)
    })
  })
  $: renderOptions = {
    value,
    plugins,
    sanitize,
    remarkRehype,
    headingIds,
    sourceMap,
  }
  $: if (!renderer) controller.render(renderOptions)
  // Async rendering starts after mount so opt-in SSR does not create a Worker.
  $: if (renderer && mounted) controller.render(renderOptions, renderer)
  beforeUpdate(() => {
    if (
      appliedFile !== file ||
      appliedPlugins !== plugins ||
      appliedLocale !== locale
    )
      off()
  })
  afterUpdate(() => {
    if (!file || destroyed) return
    const changed =
      appliedFile !== file ||
      appliedPlugins !== plugins ||
      appliedLocale !== locale
    if (changed) addCopyButtons(markdownBody, locale)
    if (changed) on()
    appliedFile = file
    appliedPlugins = plugins
    appliedLocale = locale
  })

  $: html = `${file ?? ''}<!--${i}-->`
</script>

<div bind:this={markdownBody} class="markdown-body" aria-busy={pending}>
  {#if pending}
    <p role="status" class="bytemd-render-pending">
      {locale?.renderPending ?? 'Rendering preview…'}
    </p>
  {:else if failed}
    <p role="alert" class="bytemd-render-error">
      {locale?.renderError ?? 'Preview could not be rendered.'}
    </p>
  {:else}
    {@html html}
  {/if}
</div>
