import { Hono } from 'hono'
import type { SiteAdapter } from '@/adapters/types'
import type { Option } from '@/core/config'
import { isDataFile, optionsFromData, parseDataFile } from '@/core/options'
import type { AppEnv } from '../../env'
import { readCache, repoScope, writeCache } from '../../cache'
import { GitError, type GitProvider } from '../../providers/git/types'
import { withConfig, withRepo } from './middleware'

/** The choices behind a field's `options_from`. */
export const optionRoutes = new Hono<AppEnv>()

const OPTIONS_TTL = 60

/**
 * One option per page in a content folder: regular pages and leaf bundles, plus Hugo term
 * pages (content/categories/<slug>/_index.md). The slug is written, the title shown.
 */
async function folderOptions(git: GitProvider, adapter: SiteAdapter, folder: string): Promise<Option[]> {
  const pages = (await git.listTree(folder)).flatMap(({ path }) => {
    const parts = path.slice(folder.length + 1).split('/')
    const slug = parts.length === 2 && parts[1] === '_index.md' ? parts[0] : adapter.pathToSlug(folder, path, 'md')
    return slug ? [{ path, slug }] : []
  })
  const metas = await git.getFilesWithMeta(pages.map((p) => p.path))
  return metas.map((m, i) => ({ value: pages[i].slug, label: adapter.titleOf(adapter.parse(m.text ?? '').data, pages[i].slug) }))
}

optionRoutes.get('/options', withRepo, withConfig, async (c) => {
  const from = (c.req.query('from') ?? '').trim().replace(/^\/+|\/+$/g, '')
  if (!from || from.includes('..')) return c.json({ error: 'Invalid source' }, 400)

  const { token, repo } = c.get('session')
  const key = repoScope(repo!, 'options', from)
  const cached = await readCache(token, key)
  if (cached) return c.json({ options: JSON.parse(cached) })

  const git = c.get('git')
  let options: Option[]
  if (isDataFile(from)) {
    let content: string
    try {
      content = (await git.getFile(from)).content
    } catch (e) {
      if (e instanceof GitError && e.status === 404) return c.json({ error: `${from} was not found` }, 404)
      throw e
    }
    try {
      options = optionsFromData(parseDataFile(from, content))
    } catch (e) {
      return c.json({ error: `${from}: ${(e as Error).message}` }, 422)
    }
  } else {
    options = await folderOptions(git, c.get('adapter'), from)
  }

  await writeCache(token, key, JSON.stringify(options), OPTIONS_TTL)
  return c.json({ options })
})
