import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv } from '../env'
import { exchangeCode } from '../github-oauth'
import { gh } from '../providers/git/github'
import { clearSession, cookieOpts, setSession } from '../session'

const STATE_COOKIE = 'oauth_state'

export const auth = new Hono<AppEnv>()

auth.get('/github', (c) => {
  const state = crypto.randomUUID()
  setCookie(c, STATE_COOKIE, state, { ...cookieOpts(c), maxAge: 600 })
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID)
  url.searchParams.set('redirect_uri', new URL('/auth/github/callback', c.req.url).toString())
  url.searchParams.set('state', state)
  return c.redirect(url.toString())
})

auth.get('/github/callback', async (c) => {
  const { code, state, setup_action } = c.req.query()
  // Arriving from the GitHub App install flow (no state) — restart a proper login.
  if (setup_action && !state) return c.redirect('/auth/github')

  const expected = getCookie(c, STATE_COOKIE)
  deleteCookie(c, STATE_COOKIE, { path: '/' })
  if (!code || !state || !expected || state !== expected) {
    return failed(c, 'That sign-in link is no longer valid. It may have been reloaded or opened twice.')
  }

  const result = await exchangeCode(c.env, code, new URL('/auth/github/callback', c.req.url).toString())
  if (!result.ok) return failed(c, result.error)

  const u = await gh<{ login: string; name: string | null; avatar_url: string }>(result.tokens.token, '/user')
  await setSession(c, { ...result.tokens, user: { login: u.login, name: u.name, avatar: u.avatar_url } })
  return c.redirect('/')
})

/** A readable page rather than a raw error, since this is the browser's destination. */
function failed(c: Context<AppEnv>, message: string) {
  const escaped = message.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!)
  return c.html(
    `<!doctype html><meta charset="utf-8"><title>Sign-in failed</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:26rem;margin:20vh auto;padding:0 1rem;color:#111}
a{display:inline-block;margin-top:1rem;background:#111;color:#fff;padding:.5rem 1rem;border-radius:.375rem;text-decoration:none}</style>
<h1 style="font-size:1.25rem">Could not sign in</h1><p>${escaped}</p><a href="/auth/github">Try again</a>`,
    400,
  )
}

auth.post('/logout', (c) => {
  clearSession(c)
  return c.json({ ok: true })
})
