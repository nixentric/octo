import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import { useDelayed } from './use-delayed'

export function useFetch<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: !!path })
  const [tick, setTick] = useState(0)
  const fetched = useRef(path)

  useEffect(() => {
    if (!path) return
    let alive = true
    // Drop the previous path's result: showing one collection's entries under
    // another collection's heading is worse than showing a loading state. A refetch
    // keeps what it has meanwhile, so pages built on it (the config) never unmount.
    setState((s) => (fetched.current === path ? { data: s.data, loading: true } : { loading: true }))
    fetched.current = path
    api<T>(path)
      .then((data) => alive && setState({ data, loading: false }))
      .catch((error: ApiError) => alive && setState({ error, loading: false }))
    return () => {
      alive = false
    }
  }, [path, tick])

  const refetch = useCallback(() => setTick((t) => t + 1), [])
  // `loading` drives logic; `showLoading` drives skeletons.
  const showLoading = useDelayed(state.loading)
  return { ...state, showLoading, refetch }
}
