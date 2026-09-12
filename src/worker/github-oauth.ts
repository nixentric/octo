import type { Env } from './env'

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export type Tokens = { token: string; refresh?: string; exp?: number }

async function tokenRequest(env: Env, params: Record<string, string>): Promise<Tokens | null> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'octo-cms' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, ...params }),
  })
  const data = (await res.json()) as TokenResponse
  if (!data.access_token) return null
  return {
    token: data.access_token,
    refresh: data.refresh_token,
    exp: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  }
}

export function exchangeCode(env: Env, code: string, redirectUri: string) {
  return tokenRequest(env, { code, redirect_uri: redirectUri })
}

export function refreshAccessToken(env: Env, refreshToken: string) {
  return tokenRequest(env, { grant_type: 'refresh_token', refresh_token: refreshToken })
}
