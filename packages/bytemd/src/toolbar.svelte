<script lang="ts">
  import { icons } from './icons'
  import ToolbarActions from './toolbar-actions.svelte'
  import type { BytemdEditorContext, BytemdAction, BytemdLocale } from './types'
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import type { DelegateInstance } from 'tippy.js'
  import { delegate } from 'tippy.js'

  const dispatch = createEventDispatcher()
  let toolbar: HTMLElement

  export let context: BytemdEditorContext
  export let split: boolean
  export let activeTab: false | 'write' | 'preview'
  export let fullscreen: boolean
  export let sidebar: false | 'help' | 'toc'
  export let locale: BytemdLocale
  export let actions: BytemdAction[]
  export let rightAfferentActions: BytemdAction[]

  interface RightAction extends BytemdAction {
    active?: boolean
    hidden?: boolean
  }

  $: tocActive = sidebar === 'toc'
  $: helpActive = sidebar === 'help'
  $: writeActive = activeTab === 'write'
  $: previewActive = activeTab === 'preview'

  $: rightActions = [
    {
      title: tocActive ? locale.closeToc : locale.toc,
      icon: icons.AlignTextLeftOne,
      handler: {
        type: 'action',
        click() {
          dispatch('click', 'toc')
        },
      },
      active: tocActive,
      group: 'sidebar',
    },
    {
      title: helpActive ? locale.closeHelp : locale.help,
      icon: icons.Helpcenter,
      handler: {
        type: 'action',
        click() {
          dispatch('click', 'help')
        },
      },
      active: helpActive,
      group: 'sidebar',
    },
    {
      title: writeActive ? locale.exitWriteOnly : locale.writeOnly,
      icon: icons.LeftExpand,
      handler: {
        type: 'action',
        click() {
          dispatch('tab', 'write')
        },
      },
      active: writeActive,
      hidden: !split,
      group: 'mode',
    },
    {
      title: previewActive ? locale.exitPreviewOnly : locale.previewOnly,
      icon: icons.RightExpand,
      handler: {
        type: 'action',
        click() {
          dispatch('tab', 'preview')
        },
      },
      active: previewActive,
      hidden: !split,
      group: 'mode',
    },
    {
      title: fullscreen ? locale.exitFullscreen : locale.fullscreen,
      icon: fullscreen ? icons.OffScreen : icons.FullScreen,
      handler: {
        type: 'action',
        click() {
          dispatch('click', 'fullscreen')
        },
      },
      group: 'view',
    },
    {
      title: locale.source,
      icon: icons.GithubOne,
      handler: {
        type: 'action',
        click() {
          window.open('https://github.com/bigJiHua/bytemd')
        },
      },
      group: 'source',
    },
    ...rightAfferentActions,
  ] as RightAction[]

  const tippyClass = 'bytemd-tippy'
  const tippyClassRight = 'bytemd-tippy-right'
  const tippyPathKey = 'bytemd-tippy-path'

  function getPayloadFromElement(e: Element) {
    const paths = e
      .getAttribute(tippyPathKey)
      ?.split('-')
      ?.map((x) => parseInt(x, 10))
    if (!paths) return
    // if (!paths) {
    //   return {
    //     paths: [],
    //     item: {
    //       title: 'test',
    //       handler: actions,
    //     },
    //   };
    // }

    let item: BytemdAction = {
      title: '',
      handler: {
        type: 'dropdown',
        actions: e.classList.contains(tippyClassRight) ? rightActions : actions,
      },
    }
    paths?.forEach((index) => {
      if (item.handler?.type === 'dropdown') {
        item = item.handler.actions[index]
      }
    })

    return { paths, item: item }
  }

  let delegateInstance: DelegateInstance

  function themeFor(reference: Element) {
    const dark =
      !!reference.closest('.dark') ||
      !!reference.closest('[data-theme="dark"]') ||
      document.documentElement.classList.contains('dark') ||
      document.documentElement.dataset.theme === 'dark'
    return dark ? 'light-border bytemd-dark' : 'light-border'
  }

  function init() {
    delegateInstance = delegate(toolbar, {
      target: `.${tippyClass}`,
      // Touch devices do not reliably synthesize mouseenter, so allow a tap
      // to toggle the same menu that hover opens on desktop.
      trigger: 'mouseenter focus click',
      onShow(instance) {
        const theme = themeFor(instance.reference)
        if (instance.props.theme !== theme) instance.setProps({ theme })
      },
      onCreate({ setProps, reference }) {
        // Poppers attach to <body>. Use tippy's own theme attribute so the
        // menu follows a local `.dark` container, not just the root element.
        setProps({ theme: themeFor(reference) })

        const payload = getPayloadFromElement(reference)
        if (!payload) return
        const { item, paths } = payload
        const { handler } = item
        if (!handler) return

        if (handler.type === 'action') {
          setProps({
            content: item.title,
            onHidden(ins) {
              ins.destroy()
            },
          })
        } else if (handler.type === 'dropdown') {
          // dropdown
          const dropdown = document.createElement('div')
          dropdown.classList.add('bytemd-dropdown')
          dropdown.setAttribute('role', 'menu')
          if (item.title) dropdown.setAttribute('aria-label', item.title)

          if (item.title) {
            const dropdownTitle = document.createElement('div')
            dropdownTitle.classList.add('bytemd-dropdown-title')
            dropdownTitle.appendChild(document.createTextNode(item.title))
            dropdown.appendChild(dropdownTitle)
          }

          handler.actions.forEach((subAction, i) => {
            const dropdownItem = document.createElement('div')
            dropdownItem.classList.add('bytemd-dropdown-item')
            dropdownItem.setAttribute(tippyPathKey, [...paths, i].join('-'))
            dropdownItem.setAttribute('role', 'menuitem')
            dropdownItem.tabIndex = 0
            if (subAction.handler?.type === 'dropdown') {
              dropdownItem.classList.add(tippyClass)
              dropdownItem.setAttribute('aria-haspopup', 'menu')
            }
            if (reference.classList.contains(tippyClassRight)) {
              dropdownItem.classList.add(tippyClassRight)
            }
            // div.setAttribute('data-tippy-placement', 'right');
            dropdownItem.innerHTML = `${
              subAction.icon
                ? `<div class="bytemd-dropdown-item-icon">${subAction.icon}</div>`
                : ''
            }<div class="bytemd-dropdown-item-title">${subAction.title}</div>`
            dropdown.appendChild(dropdownItem)
          })

          setProps({
            allowHTML: true,
            showOnCreate: true,
            theme: 'light-border',
            placement: 'bottom-start',
            interactive: true,
            interactiveDebounce: 50,
            arrow: false,
            offset: [0, 4],
            content: dropdown.outerHTML,
            onHidden(ins) {
              ins.destroy()
            },
            onCreate(ins) {
              ;[
                ...ins.popper.querySelectorAll('.bytemd-dropdown-item'),
              ].forEach((el, i) => {
                const actionHandler = handler.actions[i]?.handler
                if (actionHandler?.type === 'action') {
                  const { mouseenter, mouseleave } = actionHandler
                  if (mouseenter) {
                    el.addEventListener('mouseenter', () => {
                      mouseenter(context)
                    })
                  }
                  if (mouseleave) {
                    el.addEventListener('mouseleave', () => {
                      mouseleave(context)
                    })
                  }
                }

                el.addEventListener('click', (event) => {
                  const itemHandler = getPayloadFromElement(el)?.item?.handler
                  if (itemHandler?.type !== 'action') return
                  event.stopPropagation()
                  itemHandler.click(context)
                  delegateInstance?.destroy()
                  init()
                })
                el.addEventListener('keydown', (event) => {
                  const e = event as KeyboardEvent
                  if (!['Enter', 'Space'].includes(e.code)) return
                  const itemHandler = getPayloadFromElement(el)?.item?.handler
                  if (itemHandler?.type !== 'action') return
                  e.preventDefault()
                  e.stopPropagation()
                  itemHandler.click(context)
                  delegateInstance?.destroy()
                  init()
                })
              })
            },
          })
        }
      },
    })
  }

  onMount(() => {
    init()
  })
  onDestroy(() => {
    delegateInstance?.destroy()
  })

  function handleClick(e: MouseEvent | KeyboardEvent) {
    const target = (e.target as Element).closest(`[${tippyPathKey}]`)
    if (!target) return
    const handler = getPayloadFromElement(target)?.item?.handler
    // Dropdown triggers belong to tippy. Rebuilding the delegate here would
    // close the menu that a tap just opened.
    if (handler?.type !== 'action') return
    handler.click(context)
    delegateInstance?.destroy()
    init()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!['Enter', 'Space'].includes(e.code)) return
    const target = (e.target as Element).closest(`[${tippyPathKey}]`)
    if (!target) return
    const handler = getPayloadFromElement(target)?.item?.handler
    if (handler?.type === 'dropdown') {
      // These triggers are divs: no native click is synthesized for
      // Enter/Space, so toggle the tippy instance directly.
      e.preventDefault()
      const inst = (target as unknown as { _tippy?: DelegateInstance })._tippy
      if (inst) {
        if (inst.state.isVisible) inst.hide()
        else inst.show()
      }
      return
    }
    if (handler?.type !== 'action') return
    e.preventDefault()
    handler.click(context)
    delegateInstance?.destroy()
    init()
  }

  // tippy has no built-in Escape handling; without this, a menu can only be
  // dismissed by clicking away. Only instances this toolbar owns are hidden.
  function handleEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    let hiddenAny = false
    document.querySelectorAll(`.${tippyClass}`).forEach((el) => {
      const inst = (el as unknown as { _tippy?: DelegateInstance })._tippy
      if (inst?.state.isVisible) {
        inst.hide()
        hiddenAny = true
      }
    })
    if (hiddenAny) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  let writeTab: HTMLElement
  let previewTab: HTMLElement

  function handleTabKeydown(e: KeyboardEvent, tab: 'write' | 'preview') {
    if (['Enter', 'Space'].includes(e.code)) {
      dispatch('tab', tab)
      return
    }
    const next =
      e.key === 'ArrowLeft'
        ? 'write'
        : e.key === 'ArrowRight'
          ? 'preview'
          : undefined
    if (!next) return
    // Roving tabindex: one stop for the tablist, arrows move selection.
    e.preventDefault()
    dispatch('tab', next)
    ;(next === 'write' ? writeTab : previewTab).focus()
  }
</script>

<svelte:window on:keydown={handleEscape} />

<div
  class="bytemd-toolbar"
  role="toolbar"
  tabindex="-1"
  aria-label={locale.toolbar ?? 'Editor toolbar'}
  bind:this={toolbar}
  on:click={handleClick}
  on:keydown={handleKeydown}
>
  <div class="bytemd-toolbar-left">
    {#if split}
      <ToolbarActions {actions} />
    {:else}
      <div
        class="bytemd-toolbar-tabs"
        role="tablist"
        aria-label={`${locale.write} / ${locale.preview}`}
      >
        <div
          bind:this={writeTab}
          on:click={() => dispatch('tab', 'write')}
          on:keydown|self={(e) => handleTabKeydown(e, 'write')}
          class="bytemd-toolbar-tab"
          class:bytemd-toolbar-tab-active={activeTab !== 'preview'}
          role="tab"
          tabindex={activeTab !== 'preview' ? 0 : -1}
          aria-selected={activeTab !== 'preview'}
        >
          {locale.write}
        </div>
        <div
          bind:this={previewTab}
          on:click={() => dispatch('tab', 'preview')}
          on:keydown|self={(e) => handleTabKeydown(e, 'preview')}
          class="bytemd-toolbar-tab"
          class:bytemd-toolbar-tab-active={activeTab === 'preview'}
          role="tab"
          tabindex={activeTab === 'preview' ? 0 : -1}
          aria-selected={activeTab === 'preview'}
        >
          {locale.preview}
        </div>
      </div>
    {/if}
  </div>

  <div class="bytemd-toolbar-right">
    <ToolbarActions actions={rightActions} right />
  </div>

  {#if !split}
    <div
      class="bytemd-toolbar-actions"
      role="group"
      aria-label={locale.cheatsheet}
    >
      <ToolbarActions {actions} />
    </div>
  {/if}
</div>
