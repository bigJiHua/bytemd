# @bytemd/plugin-mermaid

[![npm](https://img.shields.io/npm/v/@bytemd/plugin-mermaid.svg)](https://npm.im/@bytemd/plugin-mermaid)

ByteMD plugin to support Mermaid diagram

## Usage

```js
import mermaid from '@bytemd/plugin-mermaid'
import { Editor } from 'bytemd'

new Editor({
  target: document.body,
  props: {
    plugins: [
      mermaid(),
      // ... other plugins
    ],
  },
})
```

## Rendering and failures

Each diagram's configuration and awaited rendering run together in a shared queue for this plugin module, so Viewers using different themes do not reset one another mid-render. IDs are unique within the module, stale queued jobs are skipped, and a rejected job does not block subsequent diagrams. Direct calls to the global Mermaid API from the host require separate coordination.

The original code stays visible until rendering and interaction binding succeed. Failed diagrams retain their source; ByteMD Viewers show a local `locale.pluginError` alert and emit `bytemd-plugin-error` with diagnostic details. Temporary rendering nodes and successful replacements are cleaned up on update/unmount. Automatic Mermaid page scanning (`startOnLoad`) and Mermaid's own error-diagram output (`suppressErrorRendering`) are overridden to keep these lifetimes under the plugin's control.

## License

MIT
