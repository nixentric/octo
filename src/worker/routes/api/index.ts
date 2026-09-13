import { Hono } from 'hono'
import type { AppEnv } from '../../env'
import { getSession } from '../../session'
import { configRoutes } from './config'
import { entryRoutes } from './entries'
import { mediaRoutes } from './media'
import { repoRoutes } from './repo'
import { statsRoutes } from './stats'

export const api = new Hono<AppEnv>()

// Registered before the routes are mounted, so every one of them needs a session.
api.use('*', async (c, next) => {
  const s = await getSession(c)
  if (!s) return c.json({ error: 'Unauthorized' }, 401)
  c.set('session', s)
  await next()
})

api.route('/', repoRoutes)
api.route('/', configRoutes)
api.route('/', entryRoutes)
api.route('/', statsRoutes)
api.route('/', mediaRoutes)
