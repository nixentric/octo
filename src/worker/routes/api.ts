import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import YAML from 'yaml'
import { z } from 'zod'
import { adapters, resolveConfig } from '@/adapters'
import type { SiteAdapter } from '@/adapters/types'
import { CONFIG_PATH, fieldSchema, normalizeField, parseConfig, type Collection, type ResolvedConfig } from '@/core/config'
import { fieldsCommitMessage, fieldToYaml } from '@/core/config-write'
import { validateEntry } from '@/core/validate'
import type { EntryDetail, EntrySummary, RepoRef } from '@/core/types'
import type { AppEnv } from '../env'
import { gh, GitHubProvider } from '../providers/git/github'
import { GitError, type GitProvider } from '../providers/git/types'
import { cacheConfig, cachedConfig, dropCachedConfig } from '../config-cache'
import { getSession, setSession } from '../session'

export const api = new Hono<AppEnv>()

api.use('*', async (c, next) => {
  const s = await getSession(c)
  if (!s) return c.json({ error: 'Unauthorized' }, 401)
  c.set('session', s)
  await next()
})

const withRepo = createMiddleware<AppEnv>(async (c, next) => {
  const s = c.get('session')
  if (!s.repo) return c.json({ error: 'No repository connected' }, 400)
  c.set('git', new GitHubProvider(s.token, s.repo))
  await next()
})

type ConfigResult =
  | { ok: true; config: ResolvedConfig; adapter: SiteAdapter }
  | { ok: false; status: 'missing' | 'invalid'; error: string; issues?: unknown }

async function loadConfig(git: GitProvider, cache?: { token: string; repo: RepoRef }): Promise<ConfigResult> {
  let raw: string | null = cache ? await cachedConfig(cache.token, cache.repo) : null
  if (raw === null) {
    try {
      raw = (await git.getFile(CONFIG_PATH)).content
    } catch (e) {
      if (e instanceof GitError && e.status === 404) return { ok: false, status: 'missing', error: `${CONFIG_PATH} not found` }
      throw e
    }
    if (cache) await cacheConfig(cache.token, cache.repo, raw)
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

const withConfig = createMiddleware<AppEnv>(async (c, next) => {
  const s = c.get('session')
  const r = await loadConfig(c.get('git'), { token: s.token, repo: s.repo! })
  if (!r.ok) return c.json(r, 422)
  c.set('config', r.config)
  c.set('adapter', r.adapter)
  await next()
})

// ---------- session / repo ----------

api.get('/me', (c) => {
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

api.get('/repos', async (c) => {
  const { token } = c.get('session')
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
  return c.json({ repos, installUrl: `https://github.com/apps/${c.env.GITHUB_APP_SLUG}/installations/new` })
})

const repoBody = z.object({ owner: z.string().min(1), name: z.string().min(1), branch: z.string().min(1).optional() })

api.post('/repo', async (c) => {
  const p = repoBody.safeParse(await c.req.json())
  if (!p.success) return c.json({ error: 'Invalid body', issues: p.error.issues }, 400)
  const s = c.get('session')
  const info = await new GitHubProvider(s.token, { ...p.data, branch: '' }).getRepository()
  s.repo = { owner: info.owner, name: info.name, branch: p.data.branch ?? info.defaultBranch }
  await setSession(c, s)
  return c.json({ repo: s.repo, info })
})

api.delete('/repo', async (c) => {
  const s = c.get('session')
  delete s.repo
  await setSession(c, s)
  return c.json({ ok: true })
})

api.get('/repo', withRepo, async (c) => {
  const git = c.get('git')
  const s = c.get('session')
  const [info, cfg] = await Promise.all([git.getRepository(), loadConfig(git, { token: s.token, repo: s.repo! })])
  return c.json({
    repo: c.get('session').repo,
    info,
    config: cfg.ok ? { status: 'ok', collections: cfg.config.collections.length } : cfg,
  })
})

api.get('/config', withRepo, async (c) => {
  const s = c.get('session')
  const r = await loadConfig(c.get('git'), { token: s.token, repo: s.repo! })
  return r.ok ? c.json(r.config) : c.json(r, 422)
})

/**
 * Rewrites one collection's `fields` in cms.config.yml. The file is edited as a
 * YAML document rather than re-serialized, so comments and the rest of the
 * config survive, and the result is validated before anything is committed.
 */
api.put('/config/collections/:collection/fields', withRepo, async (c) => {
  const body = z.object({ fields: z.array(z.unknown()).min(1) }).safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid body', issues: body.error.issues }, 400)

  const parsedFields = z.array(fieldSchema).safeParse(body.data.fields.map(normalizeField))
  if (!parsedFields.success) return c.json({ error: 'Invalid fields', issues: parsedFields.error.issues }, 422)

  const git = c.get('git')
  const file = await git.getFile(CONFIG_PATH)
  const doc = YAML.parseDocument(file.content)
  const current = parseConfig(doc.toJS())
  if (!current.success) return c.json({ error: `${CONFIG_PATH} is invalid`, issues: current.error.issues }, 422)

  const name = c.req.param('collection')
  const index = current.data.collections.findIndex((x) => x.name === name)
  if (index < 0) return c.json({ error: 'Unknown collection' }, 404)

  doc.setIn(['collections', index, 'fields'], parsedFields.data.map(fieldToYaml))

  const validated = parseConfig(doc.toJS())
  if (!validated.success) return c.json({ error: 'The change would make the configuration invalid', issues: validated.error.issues }, 422)

  const r = await git.updateFile({
    path: CONFIG_PATH,
    sha: file.sha,
    content: doc.toString(),
    message: fieldsCommitMessage(name, current.data.collections[index].fields, parsedFields.data),
  })
  const s = c.get('session')
  await dropCachedConfig(s.token, s.repo!)
  return c.json({ ok: true, sha: r.sha, fields: parsedFields.data })
})

// ---------- entries ----------

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/
const validSlug = (s: string) => SLUG.test(s) && !s.includes('..')
const entryBody = z.object({ data: z.record(z.string(), z.unknown()), body: z.string().default('') })

/**
 * Reads an entry from the first of its candidate paths that exists — a single
 * file, or a bundle's index file.
 */
async function readEntry(git: GitProvider, adapter: SiteAdapter, col: Collection, slug: string, ref?: string, claimed?: string) {
  const trusted = claimed && adapter.pathToSlug(col.folder, claimed, col.extension) === slug ? claimed : null
  const candidates = trusted ? [trusted] : adapter.entryPaths(col.folder, slug, col.extension)
  for (const [i, path] of candidates.entries()) {
    try {
      return await git.getFile(path, ref)
    } catch (e) {
      const last = i === candidates.length - 1
      if (last || !(e instanceof GitError) || e.status !== 404) throw e
    }
  }
  return null
}

/**
 * The path to write for an existing entry. The client sends the path it loaded;
 * it is only trusted after the adapter maps it back to this slug in this
 * collection, so it can never point outside the collection folder.
 */
async function writePath(git: GitProvider, adapter: SiteAdapter, col: Collection, slug: string, claimed?: string) {
  if (claimed && adapter.pathToSlug(col.folder, claimed, col.extension) === slug) return claimed
  const candidates = adapter.entryPaths(col.folder, slug, col.extension)
  const existing = new Set((await git.listTree(col.folder)).map((f) => f.path))
  return candidates.find((p) => existing.has(p)) ?? null
}

api.use('/entries/*', withRepo, withConfig)

const collectionOf = createMiddleware<AppEnv & { Variables: { collection: Collection } }>(async (c, next) => {
  const col = c.get('config').collections.find((x) => x.name === c.req.param('collection'))
  if (!col) return c.json({ error: 'Unknown collection' }, 404)
  c.set('collection', col)
  await next()
})

api.get('/entries/:collection', collectionOf, async (c) => {
  const col = c.get('collection')
  const git = c.get('git')
  const adapter = c.get('adapter')
  const found = (await git.listTree(col.folder))
    .map((f) => ({ path: f.path, slug: adapter.pathToSlug(col.folder, f.path, col.extension) }))
    .filter((f): f is { path: string; slug: string } => f.slug !== null)
  const metas = await git.getFilesWithMeta(found.map((f) => f.path))
  let entries: EntrySummary[] = metas.map((m, i) => {
    const slug = found[i].slug
    const { data } = adapter.parse(m.text ?? '')
    return {
      path: m.path,
      slug,
      sha: m.sha,
      title: adapter.titleOf(data, slug),
      status: adapter.statusOf(data),
      updatedAt: m.lastCommit?.date,
      author: m.lastCommit?.author.name,
    }
  })

  const { q = '', sort = 'updated', dir = 'desc', page = '1' } = c.req.query()
  if (q) {
    const needle = q.toLowerCase()
    entries = entries.filter((e) => e.title.toLowerCase().includes(needle) || e.slug.toLowerCase().includes(needle))
  }
  const key = (e: EntrySummary) => (sort === 'title' ? e.title.toLowerCase() : sort === 'slug' ? e.slug : (e.updatedAt ?? ''))
  entries.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
  if (dir === 'desc') entries.reverse()

  const perPage = 20
  const p = Math.max(1, Number(page) || 1)
  return c.json({ entries: entries.slice((p - 1) * perPage, p * perPage), total: entries.length, page: p, perPage })
})

api.get('/entries/:collection/:slug{.+}', collectionOf, async (c) => {
  const col = c.get('collection')
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const adapter = c.get('adapter')
  const f = await readEntry(c.get('git'), adapter, col, slug, c.req.query('ref'), c.req.query('path'))
  if (!f) return c.json({ error: 'Entry not found' }, 404)
  const { data, body } = adapter.parse(f.content)
  const out: EntryDetail = { path: f.path, slug, sha: f.sha, data, body }
  return c.json(out)
})

api.post('/entries/:collection', collectionOf, async (c) => {
  const col = c.get('collection')
  if (!col.create) return c.json({ error: 'Collection does not allow creating entries' }, 403)
  const p = entryBody.extend({ slug: z.string() }).safeParse(await c.req.json())
  if (!p.success) return c.json({ error: 'Invalid body', issues: p.error.issues }, 400)
  const { slug, data, body } = p.data
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const invalid = validateEntry(col.fields, data, body)
  if (Object.keys(invalid).length) return c.json({ error: 'Invalid content', fieldErrors: invalid }, 422)
  const adapter = c.get('adapter')
  const [path] = adapter.entryPaths(col.folder, slug, col.extension)
  const r = await c.get('git').createFile({
    path,
    content: adapter.serialize({ data, body }),
    message: `cms: create ${col.name} "${adapter.titleOf(data, slug)}"`,
  })
  const out: EntryDetail = { path, slug, sha: r.sha, data, body }
  return c.json(out, 201)
})

api.put('/entries/:collection/:slug{.+}', collectionOf, async (c) => {
  const col = c.get('collection')
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const p = entryBody.extend({ sha: z.string().min(1), path: z.string().optional() }).safeParse(await c.req.json())
  if (!p.success) return c.json({ error: 'Invalid body', issues: p.error.issues }, 400)
  const { data, body, sha } = p.data
  const invalid = validateEntry(col.fields, data, body)
  if (Object.keys(invalid).length) return c.json({ error: 'Invalid content', fieldErrors: invalid }, 422)
  const adapter = c.get('adapter')
  const path = await writePath(c.get('git'), adapter, col, slug, p.data.path)
  if (!path) return c.json({ error: 'Entry not found' }, 404)
  const r = await c.get('git').updateFile({
    path,
    sha,
    content: adapter.serialize({ data, body }),
    message: `cms: update ${col.name} "${adapter.titleOf(data, slug)}"`,
  })
  const out: EntryDetail = { path, slug, sha: r.sha, data, body }
  return c.json(out)
})

api.delete('/entries/:collection/:slug{.+}', collectionOf, async (c) => {
  const col = c.get('collection')
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const p = z.object({ sha: z.string().min(1), title: z.string().optional(), path: z.string().optional() }).safeParse(await c.req.json())
  if (!p.success) return c.json({ error: 'Invalid body' }, 400)
  const path = await writePath(c.get('git'), c.get('adapter'), col, slug, p.data.path)
  if (!path) return c.json({ error: 'Entry not found' }, 404)
  await c.get('git').deleteFile({
    path,
    sha: p.data.sha,
    message: `cms: delete ${col.name} "${p.data.title ?? slug}"`,
  })
  return c.json({ ok: true })
})

// ---------- history ----------

api.get('/history', withRepo, async (c) => {
  const { path, limit } = c.req.query()
  const commits = await c.get('git').getHistory(path || undefined, Math.min(Number(limit) || 20, 100))
  return c.json(commits)
})

// ---------- media ----------

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', pdf: 'application/pdf', mp4: 'video/mp4',
}
const mimeOf = (path: string) => MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
const inMedia = (cfg: ResolvedConfig, p: string) => !p.includes('..') && (p === cfg.media_dir || p.startsWith(`${cfg.media_dir}/`))
const publicUrl = (cfg: ResolvedConfig, path: string) => cfg.public_media_path + path.slice(cfg.media_dir.length)

api.get('/media/raw', withRepo, async (c) => {
  const path = c.req.query('path')
  if (!path || path.includes('..')) return c.json({ error: 'Invalid path' }, 400)
  const buf = await c.get('git').getFileRaw(path, c.req.query('ref'))
  return new Response(buf, {
    headers: {
      'Content-Type': mimeOf(path),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    },
  })
})

api.get('/media', withRepo, withConfig, async (c) => {
  const cfg = c.get('config')
  const dir = c.req.query('dir') || cfg.media_dir
  if (!inMedia(cfg, dir)) return c.json({ error: 'Invalid directory' }, 400)
  const files = await c.get('git').listFiles(dir)
  const items = files.map((f) => ({ ...f, url: f.type === 'file' ? publicUrl(cfg, f.path) : undefined }))
  return c.json({ dir, root: cfg.media_dir, items })
})

api.post('/media', withRepo, withConfig, async (c) => {
  const cfg = c.get('config')
  const body = await c.req.parseBody()
  const file = body.file
  const dir = typeof body.dir === 'string' && body.dir ? body.dir : cfg.media_dir
  if (!(file instanceof File)) return c.json({ error: 'Missing file' }, 400)
  if (!inMedia(cfg, dir)) return c.json({ error: 'Invalid directory' }, 400)
  const name = file.name.replace(/[^\w.-]+/g, '-')
  const path = `${dir}/${name}`
  const r = await c.get('git').uploadFile({
    path,
    bytes: new Uint8Array(await file.arrayBuffer()),
    sha: typeof body.sha === 'string' ? body.sha : undefined,
    message: `cms: upload ${mimeOf(name).startsWith('image/') ? 'image' : 'file'} "${name}"`,
  })
  return c.json({ path, name, sha: r.sha, url: publicUrl(cfg, path) }, 201)
})

api.delete('/media', withRepo, withConfig, async (c) => {
  const cfg = c.get('config')
  const p = z.object({ path: z.string(), sha: z.string().min(1) }).safeParse(await c.req.json())
  if (!p.success || !inMedia(cfg, p.data.path)) return c.json({ error: 'Invalid body' }, 400)
  await c.get('git').deleteFile({
    path: p.data.path,
    sha: p.data.sha,
    message: `cms: delete file "${p.data.path.split('/').pop()}"`,
  })
  return c.json({ ok: true })
})
