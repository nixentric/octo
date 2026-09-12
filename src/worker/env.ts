import type { Session } from './session'
import type { GitProvider } from './providers/git/types'
import type { ResolvedConfig } from '@/core/config'
import type { SiteAdapter } from '@/adapters/types'

export type Env = {
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  SESSION_SECRET: string
  GITHUB_APP_SLUG: string
}

export type AppEnv = {
  Bindings: Env
  Variables: {
    session: Session
    git: GitProvider
    config: ResolvedConfig
    adapter: SiteAdapter
  }
}
