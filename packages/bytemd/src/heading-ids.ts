import GithubSlugger from 'github-slugger'
import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'

export interface HeadingIdOptions {
  /** Prefix every generated heading id, e.g. `user-content-`. */
  prefix?: string
}

function textContent(node: any): string {
  if (node.type === 'text') return node.value
  if (!Array.isArray(node.children)) return ''
  return node.children.map((child: any) => textContent(child)).join('')
}

/**
 * Add GitHub-style heading ids so in-page anchor links such as
 * `[Jump](#背景与目标)` resolve inside the rendered document.
 *
 * Existing ids are preserved, duplicate headings receive `-1`, `-2`, and
 * headings without text are left untouched.
 */
export const rehypeHeadingIds =
  ({ prefix = '' }: HeadingIdOptions = {}) =>
  (tree: Root) => {
    const slugger = new GithubSlugger()
    visit(tree, 'element', (node: Element) => {
      if (!/^h[1-6]$/.test(node.tagName)) return
      const existing = node.properties?.id
      if (typeof existing === 'string' && existing) return
      const slug = slugger.slug(textContent(node))
      if (!slug) return
      node.properties = { ...node.properties, id: prefix + slug }
    })
  }
