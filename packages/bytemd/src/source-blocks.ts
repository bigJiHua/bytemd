import type { Root } from 'hast'

export interface SourceBlock {
  id: string
  line: number
  index: number
}

/** Editor-only metadata, added after sanitization and user rehype transforms. */
export function annotateSourceBlocks(
  tree: Root,
  version: number
): SourceBlock[] {
  const blocks: SourceBlock[] = []
  let index = 0
  for (const node of tree.children) {
    if (node.type !== 'element') continue
    const line = node.position?.start.line
    if (line && Number.isSafeInteger(line)) {
      const id = `${version}-${index}`
      node.properties = { ...node.properties, dataBytemdBlock: id }
      blocks.push({ id, line: line - 1, index })
    }
    index++
  }
  return blocks
}
