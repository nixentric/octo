import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { DATA_KEY, readEntries, writeDataFile } from '@/core/data-file'
import { parseDataFile } from '@/core/options'
import { validateEntry } from '@/core/validate'
import type { AppEnv } from '../../env'
import { dropCache, repoScope } from '../../cache'
import { GitError } from '../../providers/git/types'
import { withConfig, withRepo } from './middleware'

/** The entries of the data files the config describes: data/platforms.yaml and the like. */
export const dataRoutes = new Hono<AppEnv>()

dataRoutes.use('/data/*', withRepo, withConfig)

const dataFileOf = (c: Context<AppEnv>) => c.get('config').data.find((d) => d.name === c.req.param('name'))
const notAMap = (path: string) => `${path} is not a map of keys, which is the only shape that can be edited here`

/** The file as it is on the branch, or null when it has not been created yet. */
const current = (c: Context<AppEnv>, path: string) =>
  c.get('git').getFile(path).catch((e) => {
    if (e instanceof GitError && e.status === 404) return null
    throw e
  })

dataRoutes.get('/data/:name', async (c) => {
  const df = dataFileOf(c)
  if (!df) return c.json({ error: 'Unknown data file' }, 404)
  const file = await current(c, df.file)
  if (!file) return c.json({ sha: null, entries: [] })

  let data: unknown
  try {
    data = parseDataFile(df.file, file.content)
  } catch (e) {
    return c.json({ error: `${df.file}: ${(e as Error).message}` }, 422)
  }
  const entries = readEntries(data, df.fields)
  if (!entries) return c.json({ error: notAMap(df.file) }, 422)
  return c.json({ sha: file.sha, entries })
})

const entriesBody = z.object({
  /** What the editor loaded, so a file changed in the meantime is not overwritten. */
  sha: z.string().nullable(),
  entries: z.array(
    z.object({
      key: z.string().regex(DATA_KEY, 'keys use letters, numbers, hyphens or underscores'),
      values: z.record(z.string(), z.unknown()),
    }),
  ),
})

/** Saves every entry at once; YAML is edited in place so its comments and layout survive. */
dataRoutes.put('/data/:name', async (c) => {
  const df = dataFileOf(c)
  if (!df) return c.json({ error: 'Unknown data file' }, 404)
  const body = entriesBody.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid body', issues: body.error.issues }, 400)

  const { entries, sha } = body.data
  const keys = entries.map((e) => e.key)
  const duplicate = keys.find((k, i) => keys.indexOf(k) !== i)
  if (duplicate) return c.json({ error: `The key "${duplicate}" is used twice` }, 422)
  const entryErrors = Object.fromEntries(
    entries.flatMap((e) => {
      const errors = validateEntry(df.fields, e.values, '')
      return Object.keys(errors).length ? [[e.key, errors]] : []
    }),
  )
  if (Object.keys(entryErrors).length) return c.json({ error: 'Some entries are not valid', entryErrors }, 422)

  const file = await current(c, df.file)
  if ((file?.sha ?? null) !== sha) {
    return c.json({ error: `${df.file} changed since it was opened. Reload to see the latest version.` }, 409)
  }
  let content: string
  try {
    if (file && readEntries(parseDataFile(df.file, file.content), df.fields) === null) return c.json({ error: notAMap(df.file) }, 422)
    content = writeDataFile(df.file, file?.content ?? '', df.fields, entries)
  } catch (e) {
    return c.json({ error: `${df.file}: ${(e as Error).message}` }, 422)
  }

  const git = c.get('git')
  const message = `cms: update data "${df.label}"`
  const r = file
    ? await git.updateFile({ path: df.file, sha: file.sha, content, message })
    : await git.createFile({ path: df.file, content, message })

  // Fields that read their options from this file should see the change straight away.
  const { token, repo } = c.get('session')
  await dropCache(token, repoScope(repo!, 'options', df.file))
  return c.json({ sha: r.sha, entries: readEntries(parseDataFile(df.file, content), df.fields) })
})
