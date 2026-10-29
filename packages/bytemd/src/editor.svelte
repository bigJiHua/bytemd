<script lang="ts" context="module">
  import type { BytemdPlugin } from './types'

  // Per-host imperative state; see viewer.svelte for why this cannot live in
  // the component scope under the Svelte 5 legacy compiler.
  const hostStates = new WeakMap<
    HTMLElement,
    { cbs: ReturnType<NonNullable<BytemdPlugin['editorEffect']>>[] }
  >()
</script>

<script lang="ts">
  import en from '../locales/en.json'
  import type { CM6CompatEditor } from './cm6-editor'
  import { debounce, throttle } from './debounce'
  import {
    createCodeMirror,
    cancelEditorInteractions,
    createEditorUtils,
    getBuiltinActions,
    handleImageUpload,
  } from './editor'
  import Help from './help.svelte'
  import { icons } from './icons'
  import { measureScrollMap, mapScrollRatio, scrollInterval } from './scroll'
  import type { SourceBlock, ScrollMap } from './scroll'
  import Status from './status.svelte'
  import Toc from './toc.svelte'
  import Toolbar from './toolbar.svelte'
  import type {
    BytemdEditorContext,
    BytemdPlugin,
    EditorProps as Props,
  } from './types'
  import Viewer from './viewer.svelte'
  import type { Root } from 'hast'
  import {
    onMount,
    createEventDispatcher,
    onDestroy,
    tick,
    afterUpdate,
    beforeUpdate,
  } from 'svelte'

  type KeyMap = Record<string, string | (() => void)>

  export let value: Props['value'] = ''
  export let plugins: NonNullable<Props['plugins']> = []
  export let sanitize: Props['sanitize'] = undefined
  export let remarkRehype: Props['remarkRehype'] = undefined
  export let headingIds: Props['headingIds'] = undefined
  export let mode: NonNullable<Props['mode']> = 'auto'
  export let previewDebounce: NonNullable<Props['previewDebounce']> = 300
  export let layoutContainment: NonNullable<Props['layoutContainment']> = false
  export let placeholder: Props['placeholder'] = undefined
  export let editorConfig: Props['editorConfig'] = undefined
  export let editorExtensions: Props['editorExtensions'] = undefined
  export let locale: Props['locale'] = undefined
  export let uploadImages: Props['uploadImages'] = undefined
  export let overridePreview: Props['overridePreview'] = undefined
  export let maxLength: NonNullable<Props['maxLength']> = Infinity
  export let renderer: Props['renderer'] = undefined

  $: mergedLocale = { ...en, ...locale }
  const dispatch = createEventDispatcher<{ change: { value: string } }>()

  $: actions = getBuiltinActions(mergedLocale, plugins, uploadImages)
  $: split = mode === 'split' || (mode === 'auto' && containerWidth >= 800)
  $: ((_) => {
    // reset active tab
    if (split) activeTab = false
  })(split)

  let root: HTMLElement
  let editorEl: HTMLElement
  let previewEl: HTMLElement
  let bodyEl: HTMLElement
  let containerWidth = Infinity // TODO: first screen

  let codemirror: ReturnType<typeof createCodeMirror>
  let editor: Editor
  let activeTab: false | 'write' | 'preview'
  let fullscreen = false
  let sidebar: false | 'help' | 'toc' = false

  // 分屏拖拽比例（魔改新增）
  let splitRatio = 50
  let dragging = false
  let stopDrag: (() => void) | undefined
  let resizeObserver: ResizeObserver | undefined
  let destroyed = false
  let appliedPlugins: BytemdPlugin[] | undefined
  const refreshEditor = throttle(() => {
    editor?.refresh()
  }, 100)

  function onHandleDown(e: MouseEvent) {
    e.preventDefault()
    stopDrag?.()
    dragging = true
    const rect = bodyEl.getBoundingClientRect()
    const move = (ev: MouseEvent) => {
      ev.preventDefault()
      splitRatio = Math.round(
        Math.min(
          90,
          Math.max(10, ((ev.clientX - rect.left) / rect.width) * 100),
        ),
      )
      refreshEditor()
    }
    const up = () => {
      dragging = false
      editor?.refresh()
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      stopDrag = undefined
    }
    stopDrag = up
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  $: styles = (() => {
    let edit: string
    let preview: string

    if (split && activeTab === false) {
      if (sidebar) {
        edit = `width:calc(${splitRatio}% - ${sidebar ? 140 : 0}px)`
        preview = `width:calc(${100 - splitRatio}% - ${sidebar ? 140 : 0}px)`
      } else {
        edit = `width:${splitRatio}%`
        preview = `width:${100 - splitRatio}%`
      }
    } else if (activeTab === 'preview') {
      edit = 'display:none'
      preview = `width:calc(100% - ${sidebar ? 280 : 0}px)`
    } else {
      edit = `width:calc(100% - ${sidebar ? 280 : 0}px)`
      preview = 'display:none'
      // TODO: use width:0 to make scroll sync work until
      // the position calculation improved (causes white screen after switching to editor only)
    }

    return { edit, preview }
  })()

  $: context = (() => {
    const context: BytemdEditorContext = {
      // @ts-ignore
      codemirror,
      editor,
      root,
      isDestroyed: () => destroyed,
      // @ts-ignore
      ...createEditorUtils(codemirror, editor),
    }
    return context
  })()

  // Per-host imperative holders; see viewer.svelte / hostStates for why a
  // component-scope object is not safe under the Svelte 5 legacy compiler.
  function host() {
    if (!root) return undefined
    let state = hostStates.get(root)
    if (!state) hostStates.set(root, (state = { cbs: [] }))
    return state
  }
  let keyMap: KeyMap = {}

  function on() {
    // console.log('on', plugins);
    const effectContext: BytemdEditorContext = {
      codemirror,
      editor,
      root,
      ...createEditorUtils(codemirror, editor),
      isDestroyed: () => destroyed,
    }
    host()!.cbs = plugins.map((p) => p.editorEffect?.(effectContext))

    keyMap = {}
    // TODO: nested shortcuts
    actions.leftActions.forEach(({ handler }) => {
      if (handler?.type === 'action' && handler.shortcut) {
        keyMap[handler.shortcut] = () => {
          handler.click(context)
        }
      }
    })
    editor.addKeyMap(keyMap)
  }
  function off() {
    // console.log('off', plugins);
    const state = host()
    if (!state) {
      editor?.removeKeyMap(keyMap) // onDestroy runs at SSR, optional chaining here
      return
    }
    const cleanups = state.cbs
    state.cbs = []
    cleanups.forEach((cb) => cb && cb())

    editor?.removeKeyMap(keyMap) // onDestroy runs at SSR, optional chaining here
  }

  let debouncedValue = value
  let setDebouncedValue: ReturnType<typeof debounce<[string]>>
  $: {
    setDebouncedValue?.cancel()
    if (!destroyed) {
      setDebouncedValue = debounce((nextValue: string) => {
        if (destroyed) return
        debouncedValue = nextValue
        overridePreview?.(previewEl, {
          value: nextValue,
          plugins,
          sanitize,
          remarkRehype,
          renderer,
        })
      }, previewDebounce)
    }
  }
  $: setDebouncedValue(value)

  $: if (editor && value !== editor.getValue()) {
    editor.setValue(value)
  }

  beforeUpdate(() => {
    if (editor && appliedPlugins !== plugins) off()
  })
  afterUpdate(() => {
    if (editor && !destroyed && appliedPlugins !== plugins) {
      on()
      appliedPlugins = plugins
    }
  })

  // Scroll sync vars
  let syncEnabled = true
  let sourceBlocks: SourceBlock[] = []
  let renderedValue: string | undefined
  let previewMatchesEditor = false
  let invalidateScrollMap = () => {}
  let updateObservedLayout = () => {}
  let hast: Root = { type: 'root', children: [] }
  let currentBlockIndex = 0

  function scrollToBlock(id: string | undefined) {
    const blocks = previewEl.querySelectorAll<HTMLElement>(
      '[data-bytemd-block]',
    )
    const targets = [...blocks].filter(
      (node) => node.dataset.bytemdBlock === id,
    )
    if (targets.length === 1) targets[0].scrollIntoView()
  }

  onMount(() => {
    codemirror = createCodeMirror()

    editor = codemirror(editorEl, {
      value,
      lineWrapping: true,
      tabSize: 8, // keep consistent with preview: https://developer.mozilla.org/en-US/docs/Web/CSS/tab-size#formal_definition
      indentUnit: 4, // nested ordered list does not work with 2 spaces
      extraKeys: {
        Enter: 'newlineAndIndentContinueMarkdownList',
      }, // https://github.com/codemirror/CodeMirror/blob/c955a0fb02d9a09cf98b775cb94589e4980303c1/mode/markdown/index.html#L359
      ...editorConfig,
      editorExtensions,
      placeholder,
    })

    // https://github.com/codemirror/CodeMirror/issues/2428#issuecomment-39315423
    // https://github.com/codemirror/CodeMirror/issues/988#issuecomment-392232020
    editor.addKeyMap({
      Tab: 'indentMore',
      'Shift-Tab': 'indentLess',
    })

    const changeHandler = () => {
      const nextValue = editor.getValue()
      previewMatchesEditor = nextValue === renderedValue
      invalidateScrollMap()
      dispatch('change', { value: nextValue })
    }
    editor.on('change', changeHandler)

    let map: ScrollMap | undefined
    let dirty = true
    let dimensions = ''
    let expectedEditorTop: number | undefined
    let expectedPreviewTop: number | undefined
    invalidateScrollMap = () => {
      dirty = true
      // Layout can change while CodeMirror renders a programmatic jump.
      // Keep its pending feedback marker; the next scroll consumes it only
      // when the actual position matches, so manual movement still proceeds.
    }
    const getScrollMap = () => {
      if (overridePreview || !previewMatchesEditor) return
      const info = editor.getScrollInfo()
      const nextDimensions = [
        info.height,
        info.clientHeight,
        info.clientWidth,
        previewEl.scrollHeight,
        previewEl.clientHeight,
        previewEl.clientWidth,
      ].join(',')
      if (dirty || dimensions !== nextDimensions) {
        dirty = false
        dimensions = nextDimensions
        map = measureScrollMap(
          previewEl,
          sourceBlocks,
          info.height - info.clientHeight,
          (line) => editor.heightAtLine(line, 'local'),
        )
      }
      return map
    }
    const editorScrollHandler = () => {
      if (!syncEnabled) return
      const info = editor.getScrollInfo()
      if (expectedEditorTop !== undefined) {
        const expected = expectedEditorTop
        expectedEditorTop = undefined
        if (Math.abs(info.top - expected) <= 1) return
      }
      const map = getScrollMap()
      if (!map) return
      const leftRatio = info.top / (info.height - info.clientHeight)
      const rightRatio = mapScrollRatio(leftRatio, map.edit, map.preview)
      if (rightRatio === undefined) return
      const top = rightRatio * (previewEl.scrollHeight - previewEl.clientHeight)
      if (Math.abs(previewEl.scrollTop - top) <= 1) return
      expectedPreviewTop = top
      previewEl.scrollTo(0, top)
    }
    const previewScrollHandler = () => {
      const map = getScrollMap()
      if (!map) return
      const rightRatio =
        previewEl.scrollTop / (previewEl.scrollHeight - previewEl.clientHeight)
      if (!Number.isFinite(rightRatio)) return
      currentBlockIndex =
        rightRatio >= 1
          ? map.tocBlocks[map.tocBlocks.length - 1]
          : map.tocBlocks[scrollInterval(rightRatio, map.toc)]
      if (!syncEnabled) return
      if (expectedPreviewTop !== undefined) {
        const expected = expectedPreviewTop
        expectedPreviewTop = undefined
        if (Math.abs(previewEl.scrollTop - expected) <= 1) return
      }
      const leftRatio = mapScrollRatio(rightRatio, map.preview, map.edit)
      if (leftRatio === undefined) return
      const info = editor.getScrollInfo()
      const top = leftRatio * (info.height - info.clientHeight)
      if (Math.abs(info.top - top) <= 1) return
      expectedEditorTop = top
      editor.scrollTo(0, top)
    }

    editor.on('scroll', editorScrollHandler)
    previewEl.addEventListener('scroll', previewScrollHandler, {
      passive: true,
    })

    const layoutObserver = new ResizeObserver(invalidateScrollMap)
    layoutObserver.observe(previewEl)
    layoutObserver.observe(editor.getScrollerElement())
    const sizer = editorEl.querySelector<HTMLElement>('.CodeMirror-sizer')
    if (sizer) layoutObserver.observe(sizer)
    let observedBody: HTMLElement | undefined
    updateObservedLayout = () => {
      const body = previewEl.querySelector<HTMLElement>('.markdown-body')
      if (body === observedBody) return
      if (observedBody) layoutObserver.unobserve(observedBody)
      observedBody = body ?? undefined
      if (observedBody) layoutObserver.observe(observedBody)
    }
    updateObservedLayout()
    const mutations = new MutationObserver(() => {
      invalidateScrollMap()
      updateObservedLayout()
    })
    mutations.observe(previewEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'open', 'data-bytemd-block'],
    })
    previewEl.addEventListener('load', invalidateScrollMap, true)
    previewEl.addEventListener('error', invalidateScrollMap, true)
    previewEl.addEventListener('toggle', invalidateScrollMap, true)
    const fonts = document.fonts
    fonts?.addEventListener('loadingdone', invalidateScrollMap)

    // handle image drop and paste
    const handleImages = async (
      e: Event,
      itemList: DataTransferItemList | undefined,
    ) => {
      if (!uploadImages) return

      const files = Array.from(itemList ?? [])
        .map((item) => {
          if (item.type.startsWith('image/')) {
            return item.getAsFile()
          }
        })
        .filter((f): f is File => f != null)

      if (files.length) {
        e.preventDefault() // important
        await handleImageUpload(context, uploadImages, files)
      }
    }

    const dropHandler: Parameters<Editor['on']>[1] = (_, e) => {
      handleImages(e, e.dataTransfer?.items)
    }
    const pasteHandler: Parameters<Editor['on']>[1] = (_, e) => {
      handleImages(e, e.clipboardData?.items)
    }
    editor.on('drop', dropHandler)
    editor.on('paste', pasteHandler)

    resizeObserver = new ResizeObserver((entries) => {
      containerWidth = entries[0].contentRect.width
      invalidateScrollMap()
    })
    resizeObserver.observe(root, { box: 'border-box' })

    // No need to call `on` because cm instance would change once after init
    return () => {
      layoutObserver.disconnect()
      mutations.disconnect()
      previewEl.removeEventListener('load', invalidateScrollMap, true)
      previewEl.removeEventListener('error', invalidateScrollMap, true)
      previewEl.removeEventListener('toggle', invalidateScrollMap, true)
      fonts?.removeEventListener('loadingdone', invalidateScrollMap)
      invalidateScrollMap = updateObservedLayout = () => {}
      editor.off('change', changeHandler)
      editor.off('scroll', editorScrollHandler)
      editor.off('drop', dropHandler)
      editor.off('paste', pasteHandler)
      previewEl.removeEventListener('scroll', previewScrollHandler)
    }
  })
  onDestroy(() => {
    destroyed = true
    if (editor) cancelEditorInteractions(editor)
    // Svelte 5 runs destroy callbacks after DOM removal, so the blur event
    // no longer reaches CodeMirror. Clear the blink interval handle directly
    // so a focused, detached editor cannot keep it (and its DOM) alive.
    const blinker = (editor as unknown as { display?: { blinker?: unknown } })
      ?.display?.blinker
    if (blinker !== undefined && blinker !== null) clearInterval(blinker)
    // A focused, detached CodeMirror otherwise keeps its document/DOM alive
    // until the cursor interval notices the lost focus. Stop it immediately
    // through the public option and let the input stop its focus polling.
    editor?.setOption('cursorBlinkRate', 0)
    editor?.getInputField().blur()
    setDebouncedValue?.cancel()
    refreshEditor.cancel()
    off()
    stopDrag?.()
    resizeObserver?.disconnect()
  })
</script>

<div
  class="bytemd"
  class:bytemd-split={split && activeTab === false}
  class:bytemd-fullscreen={fullscreen}
  class:bytemd-dragging={dragging}
  bind:this={root}
>
  <Toolbar
    {context}
    {split}
    {activeTab}
    {sidebar}
    {fullscreen}
    rightAfferentActions={actions.rightActions}
    locale={mergedLocale}
    actions={actions.leftActions}
    on:tab={(e) => {
      const v = e.detail
      if (split) {
        activeTab = activeTab === v ? false : v
      } else {
        activeTab = v
      }

      if (activeTab === 'write') {
        tick().then(() => {
          !destroyed && editor && editor.focus()
        })
      }

      if (v === 'write') {
        tick().then(() => {
          // https://github.com/bytedance/bytemd/issues/232
          // https://github.com/codemirror/codemirror5/issues/3270
          !destroyed && editor && editor.setSize(null, null)
        })
      }
    }}
    on:click={(e) => {
      switch (e.detail) {
        case 'fullscreen':
          fullscreen = !fullscreen
          break
        case 'help':
          sidebar = sidebar === 'help' ? false : 'help'
          break
        case 'toc':
          sidebar = sidebar === 'toc' ? false : 'toc'
          break
      }
    }}
  />
  <div
    class="bytemd-body"
    class:bytemd-body-contained={layoutContainment}
    bind:this={bodyEl}
  >
    <div class="bytemd-editor" style={styles.edit} bind:this={editorEl} />
    {#if split && activeTab === false}
      <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
      <div
        class="bytemd-split-handle"
        on:mousedown={onHandleDown}
        on:keydown={(e) => {
          if (e.code === 'Enter') {
            e.preventDefault()
            splitRatio = 50
            refreshEditor()
            return
          }
          const delta =
            e.code === 'ArrowLeft' || e.code === 'ArrowUp'
              ? -5
              : e.code === 'ArrowRight' || e.code === 'ArrowDown'
                ? 5
                : 0
          if (!delta) return
          e.preventDefault()
          splitRatio = Math.min(90, Math.max(10, splitRatio + delta))
          refreshEditor()
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label={mergedLocale.resize}
        aria-valuemin="10"
        aria-valuemax="90"
        aria-valuenow={splitRatio}
        tabindex="0"
      />
    {/if}
    <div bind:this={previewEl} class="bytemd-preview" style={styles.preview}>
      {#if !overridePreview && (split || activeTab === 'preview')}
        <Viewer
          value={debouncedValue}
          {plugins}
          {sanitize}
          {remarkRehype}
          {headingIds}
          {renderer}
          locale={mergedLocale}
          sourceMap={true}
          on:hast={(e) => {
            hast = e.detail.hast
            sourceBlocks = e.detail.blocks
            renderedValue = e.detail.file ? e.detail.value : undefined
            previewMatchesEditor = renderedValue === editor?.getValue()
            currentBlockIndex = 0
            invalidateScrollMap()
            updateObservedLayout()
          }}
        />
      {/if}
    </div>
    <div class="bytemd-sidebar" class:bytemd-hidden={sidebar === false}>
      <div
        class="bytemd-sidebar-close"
        on:click={() => {
          sidebar = false
        }}
        on:keydown|self={(e) => {
          if (['Enter', 'Space'].includes(e.code)) {
            sidebar = false
          }
        }}
        role="button"
        tabindex="0"
        aria-label={sidebar === 'toc'
          ? mergedLocale.closeToc
          : mergedLocale.closeHelp}
      >
        {@html icons.Close}
      </div>
      <Help
        locale={mergedLocale}
        actions={actions.leftActions}
        visible={sidebar === 'help'}
      />
      <Toc
        {hast}
        locale={mergedLocale}
        {currentBlockIndex}
        on:click={(e) => scrollToBlock(e.detail.blockId)}
        visible={sidebar === 'toc'}
      />
    </div>
  </div>
  <Status
    locale={mergedLocale}
    showSync={!overridePreview && split}
    value={debouncedValue}
    {syncEnabled}
    islimited={value.length > maxLength}
    on:sync={(e) => {
      syncEnabled = e.detail
    }}
    on:top={() => {
      editor.scrollTo(null, 0)
      previewEl.scrollTo({ top: 0 })
    }}
  />
</div>
