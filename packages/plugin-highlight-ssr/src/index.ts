import type { BytemdPlugin } from 'bytemd'
import rehypeHighlight, { Options } from 'rehype-highlight'

// rehype-highlight 7 removed `ignoreMissing`; unknown languages are skipped.
export default function highlightSsr(options: Options = {}): BytemdPlugin {
  return {
    rehype: (processor) => processor.use(rehypeHighlight, options),
  }
}
