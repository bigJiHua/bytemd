<script lang="ts">
  import type { BytemdLocale } from './types'
  import type { Root, Element } from 'hast'
  import { createEventDispatcher } from 'svelte'
  import { visit } from 'unist-util-visit'

  export let hast: Root
  export let currentBlockIndex: number
  export let locale: BytemdLocale
  export let visible: boolean

  const dispatch = createEventDispatcher()

  let items: { level: number; text: string; blockId?: string }[]
  let minLevel = 6
  let currentHeadingIndex = 0

  function stringifyHeading(e: Element) {
    let result = ''
    visit(e, (node) => {
      if (node.type === 'text') {
        result += node.value
      }
    })
    return result
  }

  $: (() => {
    items = []
    minLevel = 6
    currentHeadingIndex = 0

    hast.children
      .filter((v): v is Element => v.type === 'element')
      .forEach((node, index) => {
        if (/^h[1-6]$/.test(node.tagName) && !!node.children.length) {
          const i = Number(node.tagName[1])
          minLevel = Math.min(minLevel, i)
          items.push({
            level: i,
            text: stringifyHeading(node),
            blockId: node.properties?.dataBytemdBlock as string | undefined,
          })
        }

        // console.log(currentBlockIndex, index);
        if (currentBlockIndex >= index) {
          currentHeadingIndex = items.length - 1
        }
      })
  })()
</script>

<div class="bytemd-toc" class:bytemd-hidden={!visible}>
  <h2>{locale.toc}</h2>
  <ul>
    {#each items as item, index}
      <li
        class={`bytemd-toc-${item.level}`}
        class:bytemd-toc-active={currentHeadingIndex === index}
        class:bytemd-toc-first={item.level === minLevel}
        style={`padding-left:${(item.level - minLevel) * 16 + 8}px`}
      >
        <button
          type="button"
          class="bytemd-toc-button"
          on:click={() => {
            dispatch('click', { blockId: item.blockId })
          }}
          aria-current={currentHeadingIndex === index ? 'location' : undefined}
        >
          {item.text}
        </button>
      </li>
    {/each}
  </ul>
</div>
