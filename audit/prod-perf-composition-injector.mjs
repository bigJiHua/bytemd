export class CompositionNotSupportedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CompositionNotSupportedError'
  }
}

export class CompositionInjector {
  async compose(session, text) {
    const events = []
    const unsubscribe = session.on('Input.compositionEvent', (params) => {
      events.push({
        type: params.type,
        timestamp: performance.now(),
        data: params.data,
      })
    })
    try {
      await session.send('Input.imeSetComposition', {
        selectionStart: 0,
        selectionEnd: 0,
        insertReplaceStart: 0,
        insertReplaceEnd: 0,
        text,
      })
      await session.send('Input.insertText', { text })
    } catch (e) {
      throw new CompositionNotSupportedError(
        `CDP composition failed: ${e.message}`
      )
    } finally {
      unsubscribe()
    }
    return {
      events,
      source: 'automated-cdp',
      inCompositionAsyncResult: false,
    }
  }

  async cancel(session) {
    const events = []
    const unsubscribe = session.on('Input.compositionEvent', (params) => {
      events.push({
        type: params.type,
        timestamp: performance.now(),
        data: params.data,
      })
    })
    try {
      await session.send('Input.imeSetComposition', {
        selectionStart: 0,
        selectionEnd: 0,
        insertReplaceStart: 0,
        insertReplaceEnd: 0,
        text: '',
      })
    } catch (e) {
      throw new CompositionNotSupportedError(
        `CDP composition cancel failed: ${e.message}`
      )
    } finally {
      unsubscribe()
    }
    return {
      events,
      source: 'automated-cdp',
      cancelReason: 'composition-cancelled',
    }
  }
}
