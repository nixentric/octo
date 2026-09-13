import type { RepoRef } from '@/core/types'

/**
 * A small read-through cache at the edge for GitHub responses that are read far
 * more often than they change. Keys include a digest of the caller's token, so
 * two users with different repository access never share an entry.
 */
async function key(token: string, parts: string[]) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const id = [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return new Request(`https://octo.invalid/${[id, ...parts].map(encodeURIComponent).join('/')}`)
}

export const repoScope = (repo: RepoRef, ...parts: string[]) => [repo.owner, repo.name, repo.branch, ...parts]

export async function readCache(token: string, parts: string[]): Promise<string | null> {
  const hit = await caches.default.match(await key(token, parts))
  return hit ? hit.text() : null
}

export async function writeCache(token: string, parts: string[], body: string, ttlSeconds: number) {
  await caches.default.put(
    await key(token, parts),
    new Response(body, { headers: { 'Cache-Control': `max-age=${ttlSeconds}` } }),
  )
}

export async function dropCache(token: string, parts: string[]) {
  await caches.default.delete(await key(token, parts))
}
