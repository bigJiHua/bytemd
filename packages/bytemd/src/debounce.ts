export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number
) {
  let timer: ReturnType<typeof setTimeout> | undefined

  return (...args: Args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number
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

  return (...args: Args) => {
    const now = Date.now()
    const remaining = wait - (now - last)
    pendingArgs = args

    if (remaining <= 0 || remaining > wait) {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      last = now
      fn(...args)
      pendingArgs = undefined
    } else if (!timer) {
      timer = setTimeout(invoke, remaining)
    }
  }
}
