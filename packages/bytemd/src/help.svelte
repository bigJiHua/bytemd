<script lang="ts">
  import type { BytemdAction, BytemdEditorContext, BytemdLocale } from './types'

  export let actions: BytemdAction[]
  // 面板专属条目（如 H1-H6 标题动作）：不进工具栏，只在这里出现
  export let extraActions: BytemdAction[] = []
  export let locale: BytemdLocale
  export let visible: boolean
  // 编辑器上下文：提供后每个可执行条目出现【使用】按钮
  export let context: BytemdEditorContext | undefined = undefined
  // 窄屏（移动端）：隐藏快捷键区（触屏无键盘），工具列表保持
  export let narrow = false

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
  // 工具条目 = 顶层动作（下拉父项内嵌子条目），不摊平
  $: entries = [...actions, ...extraActions]

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
    {#each entries as action}
      <li class="bytemd-tool-item">
        <div class="bytemd-tool-row">
          {#if action.icon}<div class="bytemd-help-icon">
              {@html action.icon}
            </div>{/if}
          <div class="bytemd-help-title">{action.title}</div>
          {#if action.handler?.type === 'action' && context}
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
        {#if action.handler?.type === 'dropdown'}
          <ul class="bytemd-tool-sub">
            {#each action.handler.actions as child}
              <li class="bytemd-tool-item bytemd-tool-sub-item">
                <div class="bytemd-tool-row">
                  {#if child.icon}<div class="bytemd-help-icon">
                      {@html child.icon}
                    </div>{/if}
                  <div class="bytemd-help-title">{child.title}</div>
                  {#if child.handler?.type === 'action' && context}
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
