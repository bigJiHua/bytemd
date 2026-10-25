import { testViewer } from '../../bytemd/test/viewer-contract'
import Viewer from '../src/viewer.vue'
import { createApp, h, nextTick, shallowRef } from 'vue'

describe('Vue 3 Viewer contract', () => {
  testViewer(async (props) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const currentProps = shallowRef(props)
    const app = createApp({
      setup: () => () => h(Viewer, currentProps.value),
    })
    app.mount(container)
    await nextTick()
    return {
      root: container,
      async update(nextProps) {
        currentProps.value = nextProps
        await nextTick()
        await nextTick()
      },
      async destroy() {
        app.unmount()
        container.remove()
      },
    }
  })
})
