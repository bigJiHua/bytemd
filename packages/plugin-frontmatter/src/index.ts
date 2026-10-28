import type { BytemdPlugin } from 'bytemd'
import { load } from 'js-yaml'
import remarkFrontmatter from 'remark-frontmatter'

export interface BytemdPluginFrontmatterOptions {
  onError?(err: any): void
}

declare module 'vfile' {
  interface VFile {
    frontmatter: ReturnType<typeof load>
  }
}

export default function frontmatter({
  onError,
}: BytemdPluginFrontmatterOptions = {}): BytemdPlugin {
  return {
    remark: (processor) =>
      // @ts-ignore
      processor.use(remarkFrontmatter).use(() => (tree, file) => {
        // TODO: arg types
        // console.log(tree);
        const fisrtNode = tree.children[0]
        if (fisrtNode?.type !== 'yaml') return

        try {
          file.frontmatter = load(fisrtNode.value)
        } catch (err) {
          // A silent failure would drop the frontmatter without any trace;
          // fall back to the console when the host gave no handler.
          if (onError) onError(err)
          else console.error(err)
        }
      }),
  }
}
