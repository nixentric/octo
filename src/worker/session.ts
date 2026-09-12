import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { RepoRef, User } from '@/core/types'
import type { AppEnv } from './env'
import { refreshAccessToken } from './github-oauth'

export type Session = {
  token: string
  refresh?: string
  exp?: number
  user: User
  repo?: RepoRef
}

const COOKIE = 'cms_session'
const enc = new TextEncoder()
const dec = new TextDecoder()

const b64u = {
  enc: (b: Uint8Array) =>
    btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
}

async function aesKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function seal(secret: string, data: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(JSON.stringify(data))),
  )
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return b64u.enc(out)
}

export async function unseal<T>(secret: string, sealed: string): Promise<T | null> {
  try {
    const b = b64u.dec(sealed)
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await aesKey(secret), b.slice(12))
    return JSON.parse(dec.decode(pt))
  } catch {
    return null
  }
}

export function cookieOpts(c: Context<AppEnv>) {
  return {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax' as const,
    path: '/',
  }
}

export async function setSession(c: Context<AppEnv>, session: Session) {
  setCookie(c, COOKIE, await seal(c.env.SESSION_SECRET, session), { ...cookieOpts(c), maxAge: 60 * 60 * 24 * 30 })
}

export function clearSession(c: Context<AppEnv>) {
  deleteCookie(c, COOKIE, { path: '/' })
}

export async function getSession(c: Context<AppEnv>): Promise<Session | null> {
  const raw = getCookie(c, COOKIE)
  if (!raw) return null
  const s = await unseal<Session>(c.env.SESSION_SECRET, raw)
  if (!s?.token) return null
  if (s.exp && Date.now() > s.exp - 60_000) {
    if (!s.refresh) return null
    const t = await refreshAccessToken(c.env, s.refresh)
    if (!t) return null
    Object.assign(s, t)
    await setSession(c, s)
  }
  return s
}
