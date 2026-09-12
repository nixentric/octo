import { createContext, useContext, type ReactNode } from 'react'
import type { ResolvedConfig } from '@/core/config'
import type { ApiError } from '@/lib/api'
import { useFetch } from '@/lib/use-fetch'

export type ConfigError = { status: 'missing' | 'invalid'; error: string; issues?: { path: (string | number)[]; message: string }[] }

type ConfigState = { config?: ResolvedConfig; error?: ConfigError; loading: boolean; refetch: () => void }

const Ctx = createContext<ConfigState>({ loading: true, refetch: () => {} })

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { data, error, loading, refetch } = useFetch<ResolvedConfig>('/config')
  const cfgError = error ? toConfigError(error) : undefined
  return <Ctx.Provider value={{ config: data, error: cfgError, loading, refetch }}>{children}</Ctx.Provider>
}

function toConfigError(e: ApiError): ConfigError {
  const b = e.body as Partial<ConfigError> | undefined
  return { status: b?.status ?? 'invalid', error: b?.error ?? e.message, issues: b?.issues }
}

export const useConfig = () => useContext(Ctx)
