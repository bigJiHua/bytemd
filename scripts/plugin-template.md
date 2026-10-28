# {{{packageName}}}

[![npm](https://img.shields.io/npm/v/{{{packageName}}}.svg)](https://npm.im/{{{packageName}}})

{{{desc}}}

<!-- bytemd:usage:start -->

## Usage

```js
{{{header}}}
import { Editor } from 'bytemd'
import {{importedName}} from '{{{packageName}}}'

new Editor({
  target: document.body,
  props: {
    plugins: [
      {{importedName}}(),
      // ... other plugins
    ],
  },
})
```

<!-- bytemd:usage:end -->

{{#options}}### Options

{{{options}}}
{{/options}}
{{#example}}## Example

{{{example}}}
{{/example}}
## License

MIT
