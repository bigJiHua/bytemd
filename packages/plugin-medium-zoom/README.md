# @bytemd/plugin-medium-zoom

[![npm](https://img.shields.io/npm/v/@bytemd/plugin-medium-zoom.svg)](https://npm.im/@bytemd/plugin-medium-zoom)

ByteMD plugin to zoom images like Medium

## Usage

```js
import mediumZoom from '@bytemd/plugin-medium-zoom'
import { Editor } from 'bytemd'

new Editor({
  target: document.body,
  props: {
    plugins: [
      mediumZoom(),
      // ... other plugins
    ],
  },
})
```

## Lightbox UI

The plugin renders its own lightbox around medium-zoom:

- dark translucent backdrop with blur, image fitted with a viewport margin
- close button, caption from `title`/`alt`, and `2 / 5` counter with previous/next controls for multiple images
- `Esc`, `ArrowLeft` / `ArrowRight`, backdrop click; body scroll lock and focus restore
- images inside a `---text---` divider (`.bytemd-hr-text`) are excluded from zoom
- overlay, zoomed image and UI use the top z-index range, so host overlays cannot cover them

`background`, `margin` and `filter` can still be overridden through plugin options.

The same plugin object can serve multiple viewers. Each effect owns its images, options, UI and cleanup; removing one viewer leaves the others attached. A shared controller allows one open image per document and keeps medium-zoom's global listeners from accumulating across repeated mounts. Cleanup releases the viewer's UI and scroll lock, including when it is removed during an open transition.

## License

MIT
