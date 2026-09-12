import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from './env'
import { GitError } from './providers/git/types'
import { api } from './routes/api'
import { auth } from './routes/auth'

const app = new Hono<AppEnv>()

app.route('/auth', auth)
app.route('/api', api)

app.onError((err, c) => {
  if (err instanceof GitError) {
    const status = (err.status >= 400 && err.status < 600 ? err.status : 502) as ContentfulStatusCode
    return c.json({ error: err.message }, status)
  }
  console.error(err)
  return c.json({ error: 'Internal error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
