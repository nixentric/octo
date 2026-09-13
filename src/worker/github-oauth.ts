import type { Env } from './env'

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export type Tokens = { token: string; refresh?: string; exp?: number }
export type TokenResult = { ok: true; tokens: Tokens } | { ok: false; error: string }

/**
 * GitHub answers this endpoint with HTML when something is wrong with the
 * request itself — a reused authorization code, for one — so the body is read
 * as text and only then parsed.
 */
async function tokenRequest(env: Env, params: Record<string, string>): Promise<TokenResult> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'octo-cms' },
    // Trimmed: a secret pasted with a trailing space is rejected by GitHub with
    // a message that points at the credentials rather than the whitespace.
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID.trim(),
      client_secret: env.GITHUB_CLIENT_SECRET.trim(),
      ...params,
    }),
  })

  const body = await res.text()
  let data: TokenResponse | null = null
  try {
    data = JSON.parse(body) as TokenResponse
  } catch {
    // GitHub answers a rejected authorization code with its own 500 error page.
    return {
      ok: false,
      error:
        res.status === 500
          ? 'GitHub rejected that sign-in code. It was probably already used — start again from the login screen.'
          : `GitHub returned an unexpected ${res.status} response. Try signing in again.`,
    }
  }

  if (data.access_token) {
    return {
      ok: true,
      tokens: {
        token: data.access_token,
        refresh: data.refresh_token,
        exp: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      },
    }
  }
  return { ok: false, error: data.error_description ?? data.error ?? 'GitHub did not return an access token.' }
}

export function exchangeCode(env: Env, code: string, redirectUri: string) {
  return tokenRequest(env, { code, redirect_uri: redirectUri })
}

export async function refreshAccessToken(env: Env, refreshToken: string): Promise<Tokens | null> {
  const result = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: refreshToken })
  return result.ok ? result.tokens : null
}
