export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  const scheduled = (...args: Args) => {
    cancel()
    timer = setTimeout(
      () => {
        timer = undefined
        fn(...args)
      },
      Math.max(0, wait),
    )
  }
  return Object.assign(scheduled, { cancel })
}

export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number,
) {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pendingArgs: Args | undefined

  const invoke = () => {
    timer = undefined
    last = Date.now()
    if (pendingArgs) {
      const args = pendingArgs
      pendingArgs = undefined
      fn(...args)
    }
  }

  const scheduled = (...args: Args) => {
    const now = Date.now()
    const remaining = wait - (now - last)
    pendingArgs = args

    if (remaining <= 0 || remaining > wait) {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      last = now
      fn(...args)
      pendingArgs = undefined
    } else if (timer === undefined) {
      timer = setTimeout(invoke, remaining)
    }
  }
  return Object.assign(scheduled, {
    cancel() {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      pendingArgs = undefined
      last = 0
    },
  })
}
