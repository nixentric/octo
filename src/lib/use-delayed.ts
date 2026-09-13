import { useEffect, useState } from 'react'

/**
 * True only once `active` has held for `delayMs`. A cached response arrives in
 * about ten milliseconds, and a skeleton drawn for a single frame reads as a
 * flicker — worse than showing nothing at all for that moment.
 */
export function useDelayed(active: boolean, delayMs = 180) {
  const [elapsed, setElapsed] = useState(false)

  useEffect(() => {
    if (!active) {
      setElapsed(false)
      return
    }
    const id = setTimeout(() => setElapsed(true), delayMs)
    return () => clearTimeout(id)
  }, [active, delayMs])

  return active && elapsed
}
