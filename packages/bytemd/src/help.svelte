<script lang="ts">
  import { icons } from './icons'
  import type { BytemdAction, BytemdEditorContext, BytemdLocale } from './types'
  import { createEventDispatcher } from 'svelte'

  export let actions: BytemdAction[]
  // 面板专属条目（如标题工具）：不进工具栏，只在这里出现
  export let extraActions: BytemdAction[] = []
  export let locale: BytemdLocale
  export let visible: boolean
  // 编辑器上下文：提供后每个可执行条目出现【使用】按钮
  export let context: BytemdEditorContext | undefined = undefined
  // 窄屏（移动端）：隐藏快捷键区（触屏无键盘），工具列表保持
  export let narrow = false

  const dispatch = createEventDispatcher<{ use: string }>()

  // 快捷键区沿用旧过滤：有 cheatsheet 或带快捷键才进
  function flatShortcutItems(list: BytemdAction[]) {
    let items: BytemdAction[] = []

    list.forEach((action) => {
      const { handler, cheatsheet } = action
      if (handler?.type === 'dropdown') {
        items.push(...flatShortcutItems(handler.actions))
      }
      if (cheatsheet || (handler?.type === 'action' && handler.shortcut)) {
        items.push(action)
      }
    })

    return items
  }

  $: shortcutItems = flatShortcutItems([...actions, ...extraActions])

  /**
   * 一个工具 = 一行。下拉型动作（字号/颜色/提示块/列表）保留子项作手风琴预设，
   * 父行【使用】取代表子项（字号 20px，否则首个）。
   */
  interface ToolEntry {
    action: BytemdAction
    children?: BytemdAction[]
    representative?: BytemdAction
    syntax: string
  }

  const toEntry = (action: BytemdAction): ToolEntry => {
    if (action.handler?.type !== 'dropdown') {
      return { action, syntax: action.cheatsheet ?? '' }
    }
    const children = action.handler.actions
    const representative = children.find((k) => k.title === '20') ?? children[0]
    return {
      action,
      children,
      representative,
      syntax: action.cheatsheet ?? representative?.cheatsheet ?? '',
    }
  }

  $: entries = [...actions, ...extraActions].map(toEntry)

  let expanded: Record<string, boolean> = {}
  const toggle = (key: string): void => {
    expanded = { ...expanded, [key]: !expanded[key] }
  }

  const run = (action: BytemdAction): void => {
    if (!context) return
    const { handler } = action
    if (handler?.type === 'action') {
      handler.click(context)
      context.editor.focus()
    }
    // 使用即收起面板（移动端插入后回到编辑）
    dispatch('use', action.title)
  }
</script>

<div class="bytemd-help bytemd-tool" class:bytemd-hidden={!visible}>
  <div class="bytemd-tool-head">
    <h2>{locale.tool}</h2>
  </div>
  <div class="bytemd-tool-scroll">
    <ul class="bytemd-tool-list">
      {#each entries as entry, i}
        {@const key = entry.action.title + i}
        {@const expandable = !!entry.children?.length}
        {@const runnable =
          entry.representative?.handler?.type === 'action' ||
          entry.action.handler?.type === 'action'}
        <li class="bytemd-tool-item">
          <div class="bytemd-tool-row">
            {#if entry.action.icon}<div class="bytemd-help-icon">
                {@html entry.action.icon}
              </div>{/if}
            <div class="bytemd-help-title">{entry.action.title}</div>
            <div class="bytemd-tool-actions">
              {#if runnable}
                <button
                  class="bytemd-tool-use"
                  on:click={() => run(entry.representative ?? entry.action)}
                  on:keydown|self={(e) =>
                    ['Enter', 'Space'].includes(e.code) &&
                    run(entry.representative ?? entry.action)}
                >
                  {locale.use}
                </button>
              {/if}
              {#if expandable}
                <button
                  class="bytemd-tool-toggle"
                  class:bytemd-tool-toggle-open={expanded[key]}
                  data-tooltip={locale.cheatsheet}
                  aria-expanded={!!expanded[key]}
                  on:click={() => toggle(key)}
                  on:keydown|self={(e) =>
                    ['Enter', 'Space'].includes(e.code) && toggle(key)}
                >
                  <span class="bytemd-tool-chevron"
                    >{@html icons.LeftExpand}</span
                  >
                </button>
              {/if}
            </div>
          </div>
          {#if entry.syntax}
            <div class="bytemd-tool-syntax">
              <code>{entry.syntax}</code>
            </div>
          {/if}
          {#if expandable && expanded[key]}
            <ul class="bytemd-tool-sub">
              {#each entry.children! as child, j}
                {@const ckey = key + '-' + j}
                <li class="bytemd-tool-item bytemd-tool-sub-item">
                  <div class="bytemd-tool-row">
                    {#if child.icon}<div class="bytemd-help-icon">
                        {@html child.icon}
                      </div>{/if}
                    <div class="bytemd-help-title">{child.title}</div>
                    <div class="bytemd-tool-actions">
                      {#if child.handler?.type === 'action'}
                        <button
                          class="bytemd-tool-use"
                          on:click={() => run(child)}
                          on:keydown|self={(e) =>
                            ['Enter', 'Space'].includes(e.code) && run(child)}
                        >
                          {locale.use}
                        </button>
                      {/if}
                    </div>
                  </div>
                  {#if child.cheatsheet}
                    <div class="bytemd-tool-syntax">
                      <code>{child.cheatsheet}</code>
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
    {#if !narrow}
      <h2>{locale.shortcuts}</h2>
      <ul>
        {#each shortcutItems as action}
          {#if action.handler && action.handler.type === 'action' && action.handler.shortcut}
            <li>
              {#if action.icon}<div class="bytemd-help-icon">
                  {@html action.icon}
                </div>{/if}
              <div class="bytemd-help-title">{action.title}</div>
              <div class="bytemd-help-content">
                <kbd>{action.handler.shortcut}</kbd>
              </div>
            </li>
          {/if}
        {/each}
      </ul>
    {/if}
  </div>
</div>
