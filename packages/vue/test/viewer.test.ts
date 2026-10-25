import { testViewer } from '../../bytemd/test/viewer-contract'
import Viewer from '../src/viewer.vue'
import Vue from 'vue'

describe('Vue 2 Viewer contract', () => {
  testViewer(async (props) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = new Vue({
      data: () => ({ props }),
      render(h) {
        return h(Viewer, { props: this.props })
      },
    }).$mount(container)
    await Vue.nextTick()
    return {
      root: app.$el as HTMLElement,
      async update(nextProps) {
        app.props = nextProps
        await Vue.nextTick()
        await Vue.nextTick()
      },
      async destroy() {
        app.$destroy()
        app.$el.remove()
      },
    }
  })
})
