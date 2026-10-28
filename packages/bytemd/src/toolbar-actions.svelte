<script lang="ts">
  import type { BytemdAction } from './types'

  interface ToolbarAction extends BytemdAction {
    active?: boolean
    hidden?: boolean
  }

  interface ActionGroup {
    key: string
    items: { item: ToolbarAction; index: number }[]
  }

  export let actions: ToolbarAction[]
  export let right = false

  const tippyClass = 'bytemd-tippy'
  const tippyClassRight = 'bytemd-tippy-right'

  $: groups = (() => {
    const result: ActionGroup[] = []
    actions.forEach((item, index) => {
      if (!item.handler || item.hidden) return
      const key = item.group ?? ''
      const last = result[result.length - 1]
      if (last && last.key === key) {
        last.items.push({ item, index })
      } else {
        result.push({ key, items: [{ item, index }] })
      }
    })
    return result
  })()
</script>

<div class="bytemd-toolbar-groups">
  {#each groups as group}
    <div class="bytemd-toolbar-group">
      {#each group.items as { item, index }}
        <div
          class={[
            'bytemd-toolbar-icon',
            tippyClass,
            right ? tippyClassRight : '',
          ]
            .filter(Boolean)
            .join(' ')}
          class:bytemd-toolbar-icon-active={item.active}
          role="button"
          tabindex="0"
          aria-label={item.title ?? ''}
          aria-haspopup={item.handler?.type === 'dropdown' ? 'menu' : undefined}
          bytemd-tippy-path={index}
        >
          {@html item.icon}
        </div>
      {/each}
    </div>
  {/each}
</div>
