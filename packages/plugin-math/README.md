# @bytemd/plugin-math

[![npm](https://img.shields.io/npm/v/@bytemd/plugin-math.svg)](https://npm.im/@bytemd/plugin-math)

ByteMD plugin to support math formula

## Usage

```js
import math from '@bytemd/plugin-math'
import { Editor } from 'bytemd'
import 'katex/dist/katex.css'

new Editor({
  target: document.body,
  props: {
    plugins: [
      math(),
      // ... other plugins
    ],
  },
})
```

## Rendering and failures

Expressions render in batches with an approximately 8ms work budget between browser task opportunities. A single expression can exceed that budget. Updates and unmounting cancel pending batches and ignore late work.

The plugin enables and catches KaTeX parse errors internally, overriding `katexOptions.throwOnError`. Invalid expressions, including unknown commands, retain their source and receive the Viewer's localized plugin error feedback; other expressions continue rendering. Module loading failures also preserve the source. Updates and unmounting ignore late results, and cleanup restores successful transformations to their original content.

The scheduler prefers native `scheduler.yield()` and falls back to a cancellable `setTimeout(0)`. Cleanup ignores stale work even when a native yield resumes later. This scheduling does not move synchronous Markdown parsing off the main thread; see the [performance baseline and follow-up plan](../../audit/PERFORMANCE.md).

## License

MIT
