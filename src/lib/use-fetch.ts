import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'

export function useFetch<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: !!path })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!path) return
    let alive = true
    // Drop the previous path's result: showing one collection's entries under
    // another collection's heading is worse than showing a loading state.
    setState({ loading: true })
    api<T>(path)
      .then((data) => alive && setState({ data, loading: false }))
      .catch((error: ApiError) => alive && setState({ error, loading: false }))
    return () => {
      alive = false
    }
  }, [path, tick])

  const refetch = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, refetch }
}
