# @bytemd/plugin-medium-zoom

[![npm](https://img.shields.io/npm/v/@bytemd/plugin-medium-zoom.svg)](https://npm.im/@bytemd/plugin-medium-zoom)

ByteMD plugin to zoom images like Medium

## Usage

```js

import { Editor } from 'bytemd'
import mediumZoom from '@bytemd/plugin-medium-zoom'

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

## License

MIT
