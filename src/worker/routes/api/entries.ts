import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import type { SiteAdapter } from '@/adapters/types'
import { isIgnored, type Collection } from '@/core/config'
import { isBundleIndex } from '@/core/slug'
import { validateEntry } from '@/core/validate'
import type { EntryDetail, EntrySummary, RepoRef } from '@/core/types'
import type { AppEnv } from '../../env'
import { dropCache, readCache, repoScope, writeCache } from '../../cache'
import { GitError, type GitProvider } from '../../providers/git/types'
import type { Session } from '../../session'
import { withConfig, withRepo } from './middleware'

/** Listing, reading and writing the entries of a collection. */
export const entryRoutes = new Hono<AppEnv>()

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

entryRoutes.use('/entries/*', withRepo, withConfig)

type CollectionEnv = AppEnv & { Variables: { collection: Collection } }

const collectionOf = createMiddleware<CollectionEnv>(async (c, next) => {
  const col = c.get('config').collections.find((x) => x.name === c.req.param('collection'))
  if (!col) return c.json({ error: 'Unknown collection' }, 404)
  c.set('collection', col)
  await next()
})

const LISTING_TTL = 30
const listingKey = (repo: RepoRef, collection: string) => repoScope(repo, 'entries', collection)

/** Every entry of a collection, summarised; cached briefly because it costs a tree walk and a GraphQL query. */
export async function collectionEntries(
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

/** The entry files in a collection's folder, with the slug each one is edited under, minus the ignored ones. */
async function entryFiles(git: GitProvider, adapter: SiteAdapter, col: Collection) {
  return (await git.listTree(col.folder))
    .map((f) => ({ path: f.path, slug: adapter.pathToSlug(col.folder, f.path, col.extension) }))
    .filter((f): f is { path: string; slug: string } => f.slug !== null && !isIgnored(col.ignore, f.slug))
}

async function buildEntries(
  git: GitProvider,
  adapter: SiteAdapter,
  col: Collection,
  contentDir: string,
): Promise<EntrySummary[]> {
  const found = await entryFiles(git, adapter, col)
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

entryRoutes.use('/samples/*', withRepo, withConfig)

/** What the entries hold for some keys, so a parameter's type can be recommended from how it is used. */
entryRoutes.get('/samples/:collection', collectionOf, async (c) => {
  const keys = (c.req.query('keys') ?? '').split(',').filter(Boolean)
  const adapter = c.get('adapter')
  const found = await entryFiles(c.get('git'), adapter, c.get('collection'))
  // ponytail: reads at most 100 entries, one GraphQL query; a habit shows long before that.
  const files = await c.get('git').getFilesWithMeta(found.slice(0, 100).map((f) => f.path))
  const samples = files.map((f) => {
    const { data } = adapter.parse(f.text ?? '')
    return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]))
  })
  return c.json({ samples })
})

entryRoutes.get('/entries/:collection', collectionOf, async (c) => {
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

entryRoutes.get('/entries/:collection/:slug{.+}', collectionOf, async (c) => {
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

entryRoutes.post('/entries/:collection', collectionOf, async (c) => {
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

entryRoutes.put('/entries/:collection/:slug{.+}', collectionOf, async (c) => {
  const col = c.get('collection')
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const p = entryBody.extend({ sha: z.string().min(1), path: z.string().optional(), rename: z.string().optional() }).safeParse(await c.req.json())
  if (!p.success) return c.json({ error: 'Invalid body', issues: p.error.issues }, 400)
  const { data, body, sha } = p.data
  const invalid = validateEntry(col.fields, data, body)
  if (Object.keys(invalid).length) return c.json({ error: 'Invalid content', fieldErrors: invalid }, 422)
  const adapter = c.get('adapter')
  const git = c.get('git')
  const path = await writePath(git, adapter, col, slug, p.data.path)
  if (!path) return c.json({ error: 'Entry not found' }, 404)

  const rename = p.data.rename && p.data.rename !== slug ? p.data.rename : null
  if (rename) {
    if (!validSlug(rename)) return c.json({ error: 'Invalid content', fieldErrors: { slug: 'Use letters, numbers, hyphens, dots or slashes' } }, 422)
    if (isBundleIndex(path)) return c.json({ error: 'A page bundle keeps its files in its folder, so its slug cannot be changed here yet' }, 422)
    const taken = (await git.listTree(col.folder)).some((f) => adapter.pathToSlug(col.folder, f.path, col.extension) === rename)
    if (taken) return c.json({ error: 'Invalid content', fieldErrors: { slug: `“${rename}” is already used by another entry` } }, 422)
    // Checked up front: once the new file exists, a stale sha would only surface when deleting the old one.
    if ((await git.getFile(path)).sha !== sha) return c.json({ error: 'The entry changed since it was opened' }, 409)
    const [target] = adapter.entryPaths(col.folder, rename, col.extension)
    const message = `cms: rename ${col.name} "${slug}" to "${rename}"`
    // ponytail: two commits, not one atomic move; if the delete fails the entry exists twice, never zero times.
    const created = await git.createFile({ path: target, content: adapter.serialize({ data, body }), message })
    await git.deleteFile({ path, sha, message })
    await dropCache(c.get('session').token, listingKey(c.get('session').repo!, col.name))
    const out: EntryDetail = { path: target, slug: rename, sha: created.sha, data, body }
    return c.json(out)
  }

  const r = await git.updateFile({
    path,
    sha,
    content: adapter.serialize({ data, body }),
    message: `cms: update ${col.name} "${adapter.titleOf(data, slug)}"`,
  })
  await dropCache(c.get('session').token, listingKey(c.get('session').repo!, col.name))
  const out: EntryDetail = { path, slug, sha: r.sha, data, body }
  return c.json(out)
})

entryRoutes.delete('/entries/:collection/:slug{.+}', collectionOf, async (c) => {
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
