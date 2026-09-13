import { Hono, type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import YAML from 'yaml'
import { z } from 'zod'
import { adapters, resolveConfig } from '@/adapters'
import type { SiteAdapter } from '@/adapters/types'
import { CONFIG_PATH, fieldSchema, normalizeField, parseConfig, type Collection, type ResolvedConfig } from '@/core/config'
import { fieldsCommitMessage, fieldToYaml, reorderSeq } from '@/core/config-write'
import { detectCollections, detectSite, inferFields, STARTER_FIELDS } from '@/core/generate-config'
import { validateEntry } from '@/core/validate'
import { dailyActivity, stalest, summarise } from '@/core/stats'
import type { EntryDetail, EntrySummary, RepoRef } from '@/core/types'
import type { AppEnv } from '../env'
import { gh, GitHubProvider } from '../providers/git/github'
import { GitError, type GitProvider } from '../providers/git/types'
import { dropCache, readCache, repoScope, writeCache } from '../cache'
import { getSession, setSession, type Session } from '../session'

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

const REPOS_TTL = 120

api.get('/repos', async (c) => {
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

api.get('/repos/:owner/:name/branches', async (c) => {
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
 * Writes a first cms.config.yml by reading the repository: the generator is
 * guessed from its marker files, collections from the content folders, and each
 * collection's fields from the frontmatter its entries already use.
 */
api.post('/config/generate', withRepo, async (c) => {
  const git = c.get('git')
  const session = c.get('session')

  try {
    await git.getFile(CONFIG_PATH)
    return c.json({ error: `${CONFIG_PATH} already exists` }, 409)
  } catch (e) {
    if (!(e instanceof GitError) || e.status !== 404) throw e
  }

  const paths = (await git.listTree('')).map((f) => f.path)
  const site = detectSite(paths)
  const found = detectCollections(paths, site.content_dir)

  const collections = await Promise.all(
    found.slice(0, 8).map(async (col) => {
      const samples = await git.getFilesWithMeta(col.files.slice(0, 5))
      const parsed = samples.map((s) => adapters[site.adapter].parse(s.text ?? ''))
      const fields = inferFields(parsed.map((p) => p.data), parsed.some((p) => p.body.trim()))
      return {
        name: col.name,
        label: col.label,
        folder: col.folder,
        fields: fields.length ? fields : STARTER_FIELDS,
      }
    }),
  )

  const config = {
    adapter: site.adapter,
    media_dir: site.media_dir,
    public_media_path: site.public_media_path,
    collections: collections.length
      ? collections
      : [{ name: 'posts', label: 'Posts', folder: `${site.content_dir}/posts`, fields: STARTER_FIELDS }],
  }

  const check = parseConfig(config)
  if (!check.success) return c.json({ error: 'Could not build a valid configuration', issues: check.error.issues }, 422)

  const yaml = YAML.stringify(
    { ...config, collections: config.collections.map((col) => ({ ...col, fields: col.fields.map(fieldToYaml) })) },
    { lineWidth: 0 },
  )
  await git.createFile({
    path: CONFIG_PATH,
    content: `# Managed by Octo CMS. Edit here or from Settings.\n${yaml}`,
    message: `cms: add ${CONFIG_PATH}`,
  })
  await dropCache(session.token, repoScope(session.repo!, 'config'))
  return c.json({ ok: true, detected: site, collections: config.collections.length }, 201)
})

/** Loads cms.config.yml as an editable document alongside its parsed form. */
async function configDocument(git: GitProvider) {
  const file = await git.getFile(CONFIG_PATH)
  const doc = YAML.parseDocument(file.content)
  return { file, doc, parsed: parseConfig(doc.toJS()) }
}

/** Validates a whole edited config, then commits it. */
async function commitConfig(
  c: Context<AppEnv>,
  doc: YAML.Document,
  sha: string,
  message: string,
) {
  const validated = parseConfig(doc.toJS())
  if (!validated.success) {
    return c.json({ error: 'The change would make the configuration invalid', issues: validated.error.issues }, 422)
  }
  const git = c.get('git')
  const r = await git.updateFile({ path: CONFIG_PATH, sha, content: doc.toString(), message })
  const session = c.get('session')
  await dropCache(session.token, repoScope(session.repo!, 'config'))
  return c.json({ ok: true, sha: r.sha, config: validated.data })
}

const FOLDERS_TTL = 60

/** Every directory in the repository, for the folder pickers in Settings. */
api.get('/folders', withRepo, async (c) => {
  const { token, repo } = c.get('session')
  const cached = await readCache(token, repoScope(repo!, 'folders'))
  if (cached) return c.json({ folders: JSON.parse(cached) })

  const dirs = new Set<string>()
  for (const { path } of await c.get('git').listTree('')) {
    const segments = path.split('/')
    for (let i = 1; i < segments.length; i++) dirs.add(segments.slice(0, i).join('/'))
  }
  const folders = [...dirs].filter((d) => !d.startsWith('.')).sort()
  await writeCache(token, repoScope(repo!, 'folders'), JSON.stringify(folders), FOLDERS_TTL)
  return c.json({ folders })
})

const siteBody = z.object({
  adapter: z.enum(['hugo', 'generic']).optional(),
  content_dir: z.string().min(1).optional(),
  media_dir: z.string().min(1).optional(),
  public_media_path: z.string().startsWith('/').optional(),
  site_url: z.union([z.string().url(), z.literal('')]).optional(),
}).refine((v) => Object.values(v).every((x) => typeof x !== 'string' || !x.includes('..')), 'invalid path')

api.patch('/config', withRepo, async (c) => {
  const body = siteBody.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid body', issues: body.error.issues }, 400)

  const { file, doc, parsed } = await configDocument(c.get('git'))
  if (!parsed.success) return c.json({ error: `${CONFIG_PATH} is invalid`, issues: parsed.error.issues }, 422)

  for (const [key, value] of Object.entries(body.data)) {
    if (value === undefined) continue
    if (value === '') doc.delete(key)
    else doc.set(key, value)
  }
  return commitConfig(c, doc, file.sha, 'cms: update site settings')
})

const collectionBody = z.object({
  name: z.string().regex(/^[a-z0-9_-]+$/, 'use lowercase letters, numbers, hyphens or underscores'),
  label: z.string().min(1),
  folder: z.string().min(1).refine((f) => !f.includes('..'), 'invalid folder'),
  create: z.boolean().optional(),
  extension: z.string().optional(),
})

api.post('/config/collections', withRepo, async (c) => {
  const body = collectionBody.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid body', issues: body.error.issues }, 400)

  const { file, doc, parsed } = await configDocument(c.get('git'))
  if (!parsed.success) return c.json({ error: `${CONFIG_PATH} is invalid`, issues: parsed.error.issues }, 422)
  if (parsed.data.collections.some((x) => x.name === body.data.name)) {
    return c.json({ error: `A collection named "${body.data.name}" already exists` }, 409)
  }

  const collection = { ...body.data, fields: STARTER_FIELDS.map(fieldToYaml) }
  doc.addIn(['collections'], collection)
  return commitConfig(c, doc, file.sha, `cms: add collection "${body.data.name}"`)
})

/** Sidebar order follows the order in the config file. */
api.put('/config/collections/order', withRepo, async (c) => {
  const body = z.object({ names: z.array(z.string()).min(1) }).safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid body', issues: body.error.issues }, 400)

  const { file, doc, parsed } = await configDocument(c.get('git'))
  if (!parsed.success) return c.json({ error: `${CONFIG_PATH} is invalid`, issues: parsed.error.issues }, 422)

  const current = parsed.data.collections.map((x) => x.name)
  const ok = reorderSeq(doc.get('collections') as YAML.YAMLSeq, current, body.data.names)
  if (!ok) {
    return c.json({ error: 'The new order must list every collection exactly once', collections: current }, 409)
  }
  return commitConfig(c, doc, file.sha, 'cms: reorder collections')
})

api.patch('/config/collections/:collection', withRepo, async (c) => {
  const body = collectionBody.partial({ name: true }).safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid body', issues: body.error.issues }, 400)

  const { file, doc, parsed } = await configDocument(c.get('git'))
  if (!parsed.success) return c.json({ error: `${CONFIG_PATH} is invalid`, issues: parsed.error.issues }, 422)

  const name = c.req.param('collection')
  const index = parsed.data.collections.findIndex((x) => x.name === name)
  if (index < 0) return c.json({ error: 'Unknown collection' }, 404)

  for (const [key, value] of Object.entries(body.data)) {
    if (key !== 'name' && value !== undefined) doc.setIn(['collections', index, key], value)
  }
  return commitConfig(c, doc, file.sha, `cms: update collection "${name}"`)
})

api.delete('/config/collections/:collection', withRepo, async (c) => {
  const { file, doc, parsed } = await configDocument(c.get('git'))
  if (!parsed.success) return c.json({ error: `${CONFIG_PATH} is invalid`, issues: parsed.error.issues }, 422)

  const name = c.req.param('collection')
  const index = parsed.data.collections.findIndex((x) => x.name === name)
  if (index < 0) return c.json({ error: 'Unknown collection' }, 404)
  if (parsed.data.collections.length === 1) {
    return c.json({ error: 'A site needs at least one collection' }, 422)
  }

  // Only the schema entry goes; the folder and its entries stay in the repository.
  doc.deleteIn(['collections', index])
  return commitConfig(c, doc, file.sha, `cms: remove collection "${name}"`)
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
  await dropCache(s.token, repoScope(s.repo!, 'config'))
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

type CollectionEnv = AppEnv & { Variables: { collection: Collection } }

const collectionOf = createMiddleware<CollectionEnv>(async (c, next) => {
  const col = c.get('config').collections.find((x) => x.name === c.req.param('collection'))
  if (!col) return c.json({ error: 'Unknown collection' }, 404)
  c.set('collection', col)
  await next()
})

const LISTING_TTL = 30
const listingKey = (repo: RepoRef, collection: string) => repoScope(repo, 'entries', collection)

async function collectionEntries(
  session: Session,
  git: GitProvider,
  adapter: SiteAdapter,
  col: Collection,
  contentDir: string,
): Promise<EntrySummary[]> {
  const cached = await readCache(session.token, listingKey(session.repo!, col.name))
  if (cached) return JSON.parse(cached)

  const entries = await buildEntries(git, adapter, col, contentDir)
  await writeCache(session.token, listingKey(session.repo!, col.name), JSON.stringify(entries), LISTING_TTL)
  return entries
}

async function buildEntries(
  git: GitProvider,
  adapter: SiteAdapter,
  col: Collection,
  contentDir: string,
): Promise<EntrySummary[]> {
  const found = (await git.listTree(col.folder))
    .map((f) => ({ path: f.path, slug: adapter.pathToSlug(col.folder, f.path, col.extension) }))
    .filter((f): f is { path: string; slug: string } => f.slug !== null)
  const metas = await git.getFilesWithMeta(found.map((f) => f.path))
  return metas.map((m, i) => {
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
      permalink: adapter.permalink(contentDir, col.folder, slug, data),
    }
  })
}

api.get('/entries/:collection', collectionOf, async (c) => {
  let entries = await collectionEntries(c.get('session'), c.get('git'), c.get('adapter'), c.get('collection'), c.get('config').content_dir)

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
  await dropCache(c.get('session').token, listingKey(c.get('session').repo!, col.name))
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
  await dropCache(c.get('session').token, listingKey(c.get('session').repo!, col.name))
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
  await dropCache(c.get('session').token, listingKey(c.get('session').repo!, col.name))
  return c.json({ ok: true })
})

/** Content statistics for the dashboard, all derived from what is already in Git. */
api.get('/stats', withRepo, withConfig, async (c) => {
  const session = c.get('session')
  const git = c.get('git')
  const adapter = c.get('adapter')
  const config = c.get('config')

  const perCollection = await Promise.all(
    config.collections.map(async (col) => {
      const entries = await collectionEntries(session, git, adapter, col, config.content_dir)
      return {
        ...summarise(col.name, col.label, entries),
        stale: stalest(entries, 3).map((e) => ({ slug: e.slug, title: e.title, updatedAt: e.updatedAt })),
        drafts: entries.filter((e) => e.status === 'draft').map((e) => ({ slug: e.slug, title: e.title })),
      }
    }),
  )

  const commits = await git.getHistory(undefined, 100)
  return c.json({
    collections: perCollection.map(({ drafts, ...rest }) => ({ ...rest, drafts: drafts.length, draftEntries: drafts })),
    activity: dailyActivity(commits.map((x) => x.date), 30),
  })
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
