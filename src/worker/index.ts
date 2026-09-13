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
  // The message would be an information leak in production, but hiding it
  // locally just means debugging blind.
  // import.meta.env is not always present in the worker runtime, and an error
  // handler that throws replaces the real failure with a blank 500.
  const dev = (() => {
    try {
      return import.meta.env?.DEV === true
    } catch {
      return false
    }
  })()
  return c.json(dev ? { error: err.message, stack: err.stack } : { error: 'Internal error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
