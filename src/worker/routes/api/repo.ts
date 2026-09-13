import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../env'
import { readCache, writeCache } from '../../cache'
import { gh, GitHubProvider } from '../../providers/git/github'
import { setSession } from '../../session'
import { loadConfig, withRepo } from './middleware'

/** The signed-in user, the repositories they can connect, and the connected one. */
export const repoRoutes = new Hono<AppEnv>()

repoRoutes.get('/me', (c) => {
  const { user, repo } = c.get('session')
  return c.json({ user, repo: repo ?? null })
})

type GhRepo = {
  name: string
  full_name: string
  default_branch: string
  private: boolean
  html_url: string
  owner: { login: string }
}

const REPOS_TTL = 120

repoRoutes.get('/repos', async (c) => {
  const { token } = c.get('session')
  const installUrl = `https://github.com/apps/${c.env.GITHUB_APP_SLUG}/installations/new`
  const cached = await readCache(token, ['repos'])
  if (cached) return c.json({ repos: JSON.parse(cached), installUrl })

  const { installations } = await gh<{ installations: { id: number }[] }>(token, '/user/installations')
  const lists = await Promise.all(
    installations.map((i) => gh<{ repositories: GhRepo[] }>(token, `/user/installations/${i.id}/repositories?per_page=100`)),
  )
  const repos = lists
    .flatMap((l) => l.repositories)
    .map((r) => ({
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      private: r.private,
      url: r.html_url,
    }))
  await writeCache(token, ['repos'], JSON.stringify(repos), REPOS_TTL)
  return c.json({ repos, installUrl })
})

const REPO_SEGMENT = /^[A-Za-z0-9_.-]+$/

repoRoutes.get('/repos/:owner/:name/branches', async (c) => {
  const { owner, name } = c.req.param()
  if (!REPO_SEGMENT.test(owner) || !REPO_SEGMENT.test(name)) return c.json({ error: 'Invalid repository' }, 400)

  const { token } = c.get('session')
  const cached = await readCache(token, ['branches', owner, name])
  if (cached) return c.json(JSON.parse(cached))

  const [repo, branches] = await Promise.all([
    gh<{ default_branch: string }>(token, `/repos/${owner}/${name}`),
    gh<{ name: string }[]>(token, `/repos/${owner}/${name}/branches?per_page=100`),
  ])
  const body = { branches: branches.map((b) => b.name), defaultBranch: repo.default_branch }
  await writeCache(token, ['branches', owner, name], JSON.stringify(body), REPOS_TTL)
  return c.json(body)
})

const repoBody = z.object({ owner: z.string().min(1), name: z.string().min(1), branch: z.string().min(1).optional() })

repoRoutes.post('/repo', async (c) => {
  const p = repoBody.safeParse(await c.req.json())
  if (!p.success) return c.json({ error: 'Invalid body', issues: p.error.issues }, 400)
  const s = c.get('session')
  const info = await new GitHubProvider(s.token, { ...p.data, branch: '' }).getRepository()
  s.repo = { owner: info.owner, name: info.name, branch: p.data.branch ?? info.defaultBranch }
  await setSession(c, s)
  return c.json({ repo: s.repo, info })
})

repoRoutes.delete('/repo', async (c) => {
  const s = c.get('session')
  delete s.repo
  await setSession(c, s)
  return c.json({ ok: true })
})

repoRoutes.get('/repo', withRepo, async (c) => {
  const git = c.get('git')
  const s = c.get('session')
  const [info, cfg] = await Promise.all([git.getRepository(), loadConfig(git, { token: s.token, repo: s.repo! })])
  return c.json({
    repo: c.get('session').repo,
    info,
    config: cfg.ok ? { status: 'ok', collections: cfg.config.collections.length } : cfg,
  })
})

repoRoutes.get('/history', withRepo, async (c) => {
  const { path, limit } = c.req.query()
  const commits = await c.get('git').getHistory(path || undefined, Math.min(Number(limit) || 20, 100))
  return c.json(commits)
})
