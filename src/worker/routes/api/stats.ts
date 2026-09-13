import { Hono } from 'hono'
import { dailyActivity, stalest, summarise } from '@/core/stats'
import type { AppEnv } from '../../env'
import { collectionEntries } from './entries'
import { withConfig, withRepo } from './middleware'

export const statsRoutes = new Hono<AppEnv>()

/** Content statistics for the dashboard, all derived from what is already in Git. */
statsRoutes.get('/stats', withRepo, withConfig, async (c) => {
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
