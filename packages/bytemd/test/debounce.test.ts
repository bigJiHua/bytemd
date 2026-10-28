import { debounce, throttle } from '../src/debounce'

afterEach(() => vi.useRealTimers())

test('debounce cancels pending work and remains reusable', async () => {
  vi.useFakeTimers()
  const fn = vi.fn()
  const scheduled = debounce(fn, 100)
  scheduled('old')
  scheduled.cancel()
  await vi.advanceTimersByTimeAsync(200)
  expect(fn).not.toHaveBeenCalled()
  scheduled('new')
  await vi.advanceTimersByTimeAsync(100)
  expect(fn).toHaveBeenCalledOnce()
  expect(fn).toHaveBeenLastCalledWith('new')
})

test('throttle cancels its trailing invocation and resets the interval', async () => {
  vi.useFakeTimers()
  const fn = vi.fn()
  const scheduled = throttle(fn, 100)
  scheduled('first')
  scheduled('pending')
  scheduled.cancel()
  await vi.advanceTimersByTimeAsync(100)
  expect(fn).toHaveBeenCalledOnce()
  scheduled('next')
  expect(fn).toHaveBeenLastCalledWith('next')
  expect(fn).toHaveBeenCalledTimes(2)
})
