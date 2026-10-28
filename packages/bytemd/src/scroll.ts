import type { SourceBlock } from './source-blocks'

export { annotateSourceBlocks } from './source-blocks'
export type { SourceBlock } from './source-blocks'

export interface ScrollMap {
  edit: number[]
  preview: number[]
  toc: number[]
  tocBlocks: number[]
}

/** Match surviving blocks by identity, including blocks inside plugin wrappers. */
export function measureScrollMap(
  preview: HTMLElement,
  blocks: SourceBlock[],
  editHeight: number,
  heightAtLine: (line: number) => number,
): ScrollMap | undefined {
  const previewHeight = preview.scrollHeight - preview.clientHeight
  if (
    !Number.isFinite(editHeight) ||
    !Number.isFinite(previewHeight) ||
    editHeight <= 0 ||
    previewHeight <= 0
  )
    return

  const sources = new Map(blocks.map((block) => [block.id, block]))
  const nodes = preview.querySelectorAll<HTMLElement>('[data-bytemd-block]')
  const seen = new Set<string>()
  const map: ScrollMap = {
    edit: [0],
    preview: [0],
    toc: [0],
    tocBlocks: [0],
  }
  const top = preview.getBoundingClientRect().top + preview.clientTop
  const view = preview.ownerDocument.defaultView!
  const padding =
    parseFloat(view.getComputedStyle(preview).scrollPaddingTop) || 0
  let previousIndex = -1
  let matched = false
  for (const node of nodes) {
    const id = node.dataset.bytemdBlock!
    const source = sources.get(id)
    if (!source) continue
    // Cloning/reordering blocks invalidates source-order interpolation.
    if (seen.has(id) || source.index <= previousIndex) return
    seen.add(id)
    previousIndex = source.index
    if (!node.getClientRects().length) continue
    const left = heightAtLine(source.line) / editHeight
    const right =
      (node.getBoundingClientRect().top - top + preview.scrollTop) /
      previewHeight
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue
    matched = true
    // scrollIntoView honors CSS scroll margins/padding. Highlight the target
    // even when its top intentionally remains below the viewport's top edge.
    const margin = parseFloat(view.getComputedStyle(node).scrollMarginTop) || 0
    const tocPosition = Math.min(
      1,
      Math.max(0, right - (margin + padding + 1) / previewHeight),
    )
    if (tocPosition > map.toc[map.toc.length - 1]) {
      map.toc.push(tocPosition)
      map.tocBlocks.push(source.index)
    } else if (tocPosition === 0) {
      map.tocBlocks[0] = source.index
    }
    if (
      left <= map.edit[map.edit.length - 1] ||
      right <= map.preview[map.preview.length - 1] ||
      left >= 1 ||
      right >= 1
    )
      continue
    map.edit.push(left)
    map.preview.push(right)
  }
  if (!matched) return
  map.edit.push(1)
  map.preview.push(1)
  if (map.toc[map.toc.length - 1] < 1) {
    map.toc.push(1)
    map.tocBlocks.push(previousIndex)
  }
  return map
}

export function mapScrollRatio(
  ratio: number,
  from: number[],
  to: number[],
): number | undefined {
  if (!Number.isFinite(ratio) || from.length < 2) return
  const value = Math.min(1, Math.max(0, ratio))
  const index = scrollInterval(value, from)
  const mapped =
    to[index] +
    ((value - from[index]) * (to[index + 1] - to[index])) /
      (from[index + 1] - from[index])
  return Number.isFinite(mapped) ? Math.min(1, Math.max(0, mapped)) : undefined
}

export function scrollInterval(value: number, points: number[]): number {
  let left = 0
  let right = points.length - 1
  while (left + 1 < right) {
    const middle = (left + right) >> 1
    if (points[middle] <= value) left = middle
    else right = middle
  }
  return left
}
