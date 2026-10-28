# @bytemd/plugin-highlight

[![npm](https://img.shields.io/npm/v/@bytemd/plugin-highlight.svg)](https://npm.im/@bytemd/plugin-highlight)

ByteMD plugin to highlight code blocks

## Usage

```js
import highlight from '@bytemd/plugin-highlight'
import { Editor } from 'bytemd'
import 'highlight.js/styles/default.css'

new Editor({
  target: document.body,
  props: {
    plugins: [
      highlight(),
      // ... other plugins
    ],
  },
})
```

## Rendering and failures

Code blocks render in batches with an approximately 8ms work budget between browser task opportunities. A single highlight operation can exceed that budget. Updates and unmounting cancel pending batches; source restoration and localized plugin error feedback remain available. The shared library is used only after asynchronous initialization completes.

The scheduler prefers native `scheduler.yield()` and falls back to a cancellable `setTimeout(0)`. Cleanup ignores stale work even when a native yield resumes later. This scheduling does not move synchronous Markdown parsing off the main thread; see the [performance baseline and follow-up plan](../../audit/PERFORMANCE.md).

## License

MIT
