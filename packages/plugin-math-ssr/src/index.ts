import en from './locales/en.json'
import { MathLocale, getMathActions } from './utils'
import type { BytemdPlugin } from 'bytemd'
import rehypeKatex, { Options } from 'rehype-katex'
import remarkMath from 'remark-math'

export interface BytemdPluginMathSsrOptions {
  locale?: Partial<MathLocale>
  katexOptions?: Omit<Options, 'displayMode'>
}

export default function mathSsr({
  locale: _locale,
  katexOptions,
}: BytemdPluginMathSsrOptions = {}): BytemdPlugin {
  const locale = { ...en, ..._locale }
  return {
    remark: (processor) => processor.use(remarkMath),
    rehype: (processor) =>
      processor
        .use(rehypeKatex, katexOptions)
        // rehype-katex 7 downgrades every failure to a vfile message; keep
        // the historical loud-failure contract so hosts see the render-error
        // state instead of silently rendered fallback markup.
        .use(
          () => (_tree: unknown, file: { messages: { source?: string }[] }) => {
            const failure = file.messages.find(
              (message) => message.source === 'rehype-katex'
            )
            if (failure) throw failure
          }
        ),
    actions: getMathActions(locale),
  }
}
