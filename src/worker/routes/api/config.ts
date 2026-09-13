import { Hono, type Context } from 'hono'
import YAML from 'yaml'
import { z } from 'zod'
import { adapters } from '@/adapters'
import { CONFIG_PATH, fieldSchema, normalizeField, parseConfig } from '@/core/config'
import { fieldsCommitMessage, fieldToYaml, reorderSeq } from '@/core/config-write'
import { detectCollections, detectSite, inferFields, STARTER_FIELDS, withCoreFields } from '@/core/generate-config'
import type { AppEnv } from '../../env'
import { dropCache, readCache, repoScope, writeCache } from '../../cache'
import { GitError, type GitProvider } from '../../providers/git/types'
import { loadConfig, withRepo } from './middleware'

/** cms.config.yml: reading it, generating a first one, and every edit Settings makes to it. */
export const configRoutes = new Hono<AppEnv>()

configRoutes.get('/config', withRepo, async (c) => {
  const s = c.get('session')
  const r = await loadConfig(c.get('git'), { token: s.token, repo: s.repo! })
  return r.ok ? c.json(r.config) : c.json(r, 422)
})

/**
 * Writes a first cms.config.yml by reading the repository: the generator is
 * guessed from its marker files, collections from the content folders, and each
 * collection's fields from the frontmatter its entries already use.
 */
configRoutes.post('/config/generate', withRepo, async (c) => {
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
        fields: fields.length ? withCoreFields(fields) : STARTER_FIELDS,
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
configRoutes.get('/folders', withRepo, async (c) => {
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

configRoutes.patch('/config', withRepo, async (c) => {
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
  icon: z.string().regex(/^[a-z0-9-]+$/, 'use a Lucide icon name').optional(),
  /** Empty means no group: the key is left out, or removed when editing. */
  group: z.string().trim().max(40).optional(),
  folder: z.string().min(1).refine((f) => !f.includes('..'), 'invalid folder'),
  create: z.boolean().optional(),
  extension: z.string().optional(),
})

configRoutes.post('/config/collections', withRepo, async (c) => {
  const body = collectionBody.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid body', issues: body.error.issues }, 400)

  const { file, doc, parsed } = await configDocument(c.get('git'))
  if (!parsed.success) return c.json({ error: `${CONFIG_PATH} is invalid`, issues: parsed.error.issues }, 422)
  if (parsed.data.collections.some((x) => x.name === body.data.name)) {
    return c.json({ error: `A collection named "${body.data.name}" already exists` }, 409)
  }

  const { group, ...rest } = body.data
  const collection = { ...rest, ...(group ? { group } : {}), fields: STARTER_FIELDS.map(fieldToYaml) }
  doc.addIn(['collections'], collection)
  return commitConfig(c, doc, file.sha, `cms: add collection "${body.data.name}"`)
})

/** Sidebar order follows the order in the config file. */
configRoutes.put('/config/collections/order', withRepo, async (c) => {
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

configRoutes.patch('/config/collections/:collection', withRepo, async (c) => {
  const body = collectionBody.partial({ name: true }).safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid body', issues: body.error.issues }, 400)

  const { file, doc, parsed } = await configDocument(c.get('git'))
  if (!parsed.success) return c.json({ error: `${CONFIG_PATH} is invalid`, issues: parsed.error.issues }, 422)

  const name = c.req.param('collection')
  const index = parsed.data.collections.findIndex((x) => x.name === name)
  if (index < 0) return c.json({ error: 'Unknown collection' }, 404)

  for (const [key, value] of Object.entries(body.data)) {
    if (key === 'name' || value === undefined) continue
    if (value === '') doc.deleteIn(['collections', index, key])
    else doc.setIn(['collections', index, key], value)
  }
  return commitConfig(c, doc, file.sha, `cms: update collection "${name}"`)
})

configRoutes.delete('/config/collections/:collection', withRepo, async (c) => {
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
configRoutes.put('/config/collections/:collection/fields', withRepo, async (c) => {
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
