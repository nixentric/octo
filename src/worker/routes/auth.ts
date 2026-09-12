import { Hono } from 'hono'
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
  if (!code || !state || !expected || state !== expected) return c.text('Invalid OAuth state', 400)

  const tokens = await exchangeCode(c.env, code, new URL('/auth/github/callback', c.req.url).toString())
  if (!tokens) return c.text('GitHub authorization failed', 400)

  const u = await gh<{ login: string; name: string | null; avatar_url: string }>(tokens.token, '/user')
  await setSession(c, { ...tokens, user: { login: u.login, name: u.name, avatar: u.avatar_url } })
  return c.redirect('/')
})

auth.post('/logout', (c) => {
  clearSession(c)
  return c.json({ ok: true })
})
