import { installWorkerRenderer } from '../packages/bytemd/dist/worker.mjs'
import gfm from '../packages/plugin-gfm/dist/index.mjs'
import math from '../packages/plugin-math/dist/index.mjs'

const enhanced = [gfm(), math()]
installWorkerRenderer(self, (options) => {
  if (options.fail) throw new Error('Intentional Worker audit failure')
  if (options.profile !== 'core' && options.profile !== 'enhanced')
    throw new Error('Unknown audit parser profile')
  return { plugins: options.profile === 'enhanced' ? enhanced : [] }
})
