import { createMiddleware } from 'hono/factory'
import YAML from 'yaml'
import { adapters, resolveConfig } from '@/adapters'
import type { SiteAdapter } from '@/adapters/types'
import { CONFIG_PATH, parseConfig, type ResolvedConfig } from '@/core/config'
import type { RepoRef } from '@/core/types'
import type { AppEnv } from '../../env'
import { readCache, repoScope, writeCache } from '../../cache'
import { GitHubProvider } from '../../providers/git/github'
import { GitError, type GitProvider } from '../../providers/git/types'

export const withRepo = createMiddleware<AppEnv>(async (c, next) => {
  const s = c.get('session')
  if (!s.repo) return c.json({ error: 'No repository connected' }, 400)
  c.set('git', new GitHubProvider(s.token, s.repo))
  await next()
})

type ConfigResult =
  | { ok: true; config: ResolvedConfig; adapter: SiteAdapter }
  | { ok: false; status: 'missing' | 'invalid'; error: string; issues?: unknown }

export async function loadConfig(git: GitProvider, cache?: { token: string; repo: RepoRef }): Promise<ConfigResult> {
  let raw: string | null = cache ? await readCache(cache.token, repoScope(cache.repo, 'config')) : null
  if (raw === null) {
    try {
      raw = (await git.getFile(CONFIG_PATH)).content
    } catch (e) {
      if (e instanceof GitError && e.status === 404) return { ok: false, status: 'missing', error: `${CONFIG_PATH} not found` }
      throw e
    }
    if (cache) await writeCache(cache.token, repoScope(cache.repo, 'config'), raw, 60)
  }
  let parsed: unknown
  try {
    parsed = YAML.parse(raw)
  } catch (e) {
    return { ok: false, status: 'invalid', error: `${CONFIG_PATH}: ${(e as Error).message}` }
  }
  const r = parseConfig(parsed)
  if (!r.success) return { ok: false, status: 'invalid', error: `${CONFIG_PATH} is invalid`, issues: r.error.issues }
  return { ok: true, config: resolveConfig(r.data), adapter: adapters[r.data.adapter] }
}

export const withConfig = createMiddleware<AppEnv>(async (c, next) => {
  const s = c.get('session')
  const r = await loadConfig(c.get('git'), { token: s.token, repo: s.repo! })
  if (!r.ok) return c.json(r, 422)
  c.set('config', r.config)
  c.set('adapter', r.adapter)
  await next()
})
