export class HeapProfilerController {
  async collectGarbage(session) {
    try {
      await session.send('HeapProfiler.enable')
      await session.send('HeapProfiler.collectGarbage')
      return true
    } catch (error) {
      throw new Error(`Forced GC failed: ${error.message}`)
    }
  }

  async takeSnapshot(session, label) {
    return new Promise((resolve) => {
      const chunks = []
      const unsubscribe = session.on(
        'HeapProfiler.addHeapSnapshotChunk',
        (params) => {
          chunks.push(params.chunk)
        }
      )
      session
        .send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
        .then(() => {
          unsubscribe()
          const snapshot = Buffer.from(chunks.join(''), 'utf-8')
          resolve({
            label,
            snapshot,
            timestamp: Date.now(),
            complete: snapshot.length > 0,
          })
        })
        .catch(() => {
          unsubscribe()
          resolve({
            label,
            snapshot: Buffer.alloc(0),
            timestamp: Date.now(),
            complete: false,
          })
        })
    })
  }

  async getDomCounters(session) {
    try {
      const { metrics } = await session.send('Performance.getMetrics')
      const dom = await session.send('Memory.getDOMCounters')
      const find = (name) => metrics.find((m) => m.name === name)?.value ?? 0
      return {
        ...dom,
        jsHeapUsedSize: find('JSHeapUsedSize'),
        jsHeapTotalSize: find('JSHeapTotalSize'),
      }
    } catch (error) {
      throw new Error(`DOM/heap counters unavailable: ${error.message}`)
    }
  }
}
