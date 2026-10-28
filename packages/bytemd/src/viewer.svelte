<script lang="ts" context="module">
  import type { BytemdPlugin, ViewerProps as Props } from './types'
  import type { VFile } from 'vfile'

  // Per-host imperative state. A component-scope const would still be wrapped
  // by the Svelte 5 legacy compiler, and writing it from the post-flush tick
  // re-triggered the beforeUpdate cleanup, wiping freshly bound effects.
  const hostStates = new WeakMap<
    HTMLElement,
    {
      cleanup?: () => void
      file?: VFile
      plugins?: BytemdPlugin[]
      locale?: Props['locale']
    }
  >()
</script>

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
  let destroyed = false
  let mounted = false
  let renderVersion = 0

  function host() {
    if (!markdownBody) return undefined
    let state = hostStates.get(markdownBody)
    if (!state) hostStates.set(markdownBody, (state = {}))
    return state
  }

  function on() {
    if (!mounted || destroyed || !file) return
    host()!.cleanup = runViewerEffects(markdownBody, file, plugins, locale)
  }
  function off() {
    const state = host()
    state?.cleanup?.()
    if (state) state.cleanup = undefined
  }

  onMount(() => {
    mounted = true

    const handleClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement

      if (el.classList?.contains('bytemd-copy-btn')) {
        copyCodeFromButton(el as HTMLButtonElement)
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
    // Old plugin effects keep nodes from the previous render alive; drop them
    // before the template rewrites the DOM. Cleanup must stay paired with the
    // rebind below: a redundant update that keeps the same render inputs must
    // not tear effects down, or Mermaid/zoom enhancements disappear for good.
    const state = host()
    if (!state) return
    if (
      state.file !== file ||
      state.plugins !== plugins ||
      state.locale !== locale
    )
      off()
  })
  // Svelte 5 runs `afterUpdate` effects before template DOM effects, so the
  // copy buttons and viewer effects are (re)applied after the flush instead.
  // The array keeps `plugins`/`locale` in the reaction's dependency list; the
  // applied* signature keeps the Svelte 3 "only re-run on real changes" rule.
  $: if (mounted && !destroyed && file) {
    const renderedFile = file
    const deps = [plugins, locale]
    tick().then(() => {
      if (destroyed || !markdownBody || file !== renderedFile) return
      const state = host()!
      const changed =
        state.file !== file ||
        state.plugins !== plugins ||
        state.locale !== locale
      if (!changed) return
      addCopyButtons(markdownBody, locale)
      on()
      state.file = file
      state.plugins = plugins
      state.locale = locale
      void deps
    })
  }

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
