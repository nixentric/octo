import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router'
import { api } from '@/lib/api'
import type { RepoRef, User } from '@/core/types'

export type Me = { user: User; repo: RepoRef | null }

type SessionState = { me: Me | null; loading: boolean; refresh: () => Promise<void> }

const Ctx = createContext<SessionState>({ me: null, loading: true, refresh: async () => {} })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'))
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return <Ctx.Provider value={{ me, loading, refresh }}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)

export function RequireAuth() {
  const { me, loading } = useSession()
  if (loading) return <Splash />
  if (!me) return <Navigate to="/login" replace />
  return <Outlet />
}

export function RequireRepo() {
  const { me } = useSession()
  if (!me?.repo) return <Navigate to="/connect" replace />
  return <Outlet />
}

export function Splash() {
  return <div className="h-screen" aria-busy="true" aria-label="Loading" />
}

export async function logout() {
  await fetch('/auth/logout', { method: 'POST' })
  window.location.href = '/login'
}
