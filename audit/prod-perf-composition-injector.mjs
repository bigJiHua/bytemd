export class CompositionNotSupportedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CompositionNotSupportedError'
  }
}

let bindingSequence = 0

// CDP Input has no compositionEvent notification. Forward actual DOM events
// through a Runtime binding registered before the input commands.
async function inject(session, action, failureLabel) {
  const events = []
  const binding = `__bytemdComposition${++bindingSequence}`
  let failure
  const unsubscribe = session.on('Runtime.bindingCalled', (params) => {
    if (params.name !== binding) return
    events.push(JSON.parse(params.payload))
  })
  const evaluate = async (expression) => {
    const reply = await session.send('Runtime.evaluate', { expression })
    if (reply.exceptionDetails)
      throw new Error(
        reply.exceptionDetails.exception?.description ??
          reply.exceptionDetails.text,
      )
  }
  try {
    await session.send('Runtime.addBinding', { name: binding })
    await evaluate(`(() => {
      const types = ['compositionstart','compositionupdate','compositionend'];
      const listener = event => window.${binding}(JSON.stringify({type:event.type,data:event.data,timestamp:performance.now()}));
      types.forEach(type => document.addEventListener(type,listener,true));
      window.${binding}Cleanup = () => {
        types.forEach(type => document.removeEventListener(type,listener,true));
        delete window.${binding};
        delete window.${binding}Cleanup;
      };
    })()`)
    await action()
  } catch (error) {
    failure = error
  } finally {
    try {
      await evaluate(`window.${binding}Cleanup?.()`)
    } catch (error) {
      failure ??= error
    }
    try {
      await session.send('Runtime.removeBinding', { name: binding })
    } catch (error) {
      failure ??= error
    }
    unsubscribe()
  }
  if (failure)
    throw new CompositionNotSupportedError(
      `${failureLabel}: ${failure.message}`,
    )
  return events
}

export class CompositionInjector {
  async compose(session, text) {
    const events = await inject(
      session,
      async () => {
        await session.send('Input.imeSetComposition', {
          selectionStart: 0,
          selectionEnd: 0,
          insertReplaceStart: 0,
          insertReplaceEnd: 0,
          text,
        })
        await session.send('Input.insertText', { text })
      },
      'CDP composition failed',
    )
    return {
      events,
      source: 'automated-cdp',
      inCompositionAsyncResult: false,
    }
  }

  async cancel(session) {
    const events = await inject(
      session,
      async () => {
        await session.send('Input.imeSetComposition', {
          selectionStart: 0,
          selectionEnd: 0,
          insertReplaceStart: 0,
          insertReplaceEnd: 0,
          text: '',
        })
      },
      'CDP composition cancel failed',
    )
    return {
      events,
      source: 'automated-cdp',
      cancelReason: 'composition-cancelled',
    }
  }
}
