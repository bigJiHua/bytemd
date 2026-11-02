<script lang="ts">
  import type { BytemdAction, BytemdEditorContext, BytemdLocale } from './types'

  export let actions: BytemdAction[]
  // 面板专属条目（如 H1-H6 标题动作）：不进工具栏，只在这里出现
  export let extraActions: BytemdAction[] = []
  export let locale: BytemdLocale
  export let visible: boolean
  // 编辑器上下文：提供后每个条目出现【使用】按钮，点击即执行动作
  export let context: BytemdEditorContext | undefined = undefined
  // 窄屏（移动端）：隐藏快捷键区（触屏无键盘），工具列表保持
  export let narrow = false

  function flatItems(list: BytemdAction[]) {
    let items: BytemdAction[] = []

    list.forEach((action) => {
      const { handler, cheatsheet } = action
      if (handler?.type === 'dropdown') {
        items.push(...flatItems(handler.actions))
      }
      // Shortcut-only actions must reach the shortcuts section too.
      if (cheatsheet || (handler?.type === 'action' && handler.shortcut)) {
        items.push(action)
      }
    })

    return items
  }

  $: items = flatItems([...actions, ...extraActions])

  const run = (action: BytemdAction): void => {
    if (!context) return
    const { handler } = action
    if (handler?.type === 'action') {
      handler.click(context)
      context.editor.focus()
    }
  }
</script>

<div class="bytemd-help bytemd-tool" class:bytemd-hidden={!visible}>
  <h2>{locale.tool}</h2>
  <ul class="bytemd-tool-list">
    {#each items as action}
      {@const runnable = action.handler?.type === 'action' && context}
      <li class="bytemd-tool-item">
        <div class="bytemd-tool-row">
          {#if action.icon}<div class="bytemd-help-icon">
              {@html action.icon}
            </div>{/if}
          <div class="bytemd-help-title">{action.title}</div>
          {#if runnable}
            <button
              class="bytemd-tool-use"
              on:click={() => run(action)}
              on:keydown|self={(e) =>
                ['Enter', 'Space'].includes(e.code) && run(action)}
            >
              {locale.use}
            </button>
          {/if}
        </div>
        {#if action.cheatsheet}
          <div class="bytemd-tool-syntax">
            <code>{action.cheatsheet}</code>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {#if !narrow}
    <h2>{locale.shortcuts}</h2>
    <ul>
      {#each items as action}
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
