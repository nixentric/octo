import type { RepoRef } from '@/core/types'

const TTL_SECONDS = 60

/**
 * cms.config.yml is read on almost every request, so it is cached at the edge.
 * The key includes a digest of the caller's token: two users with different
 * repository access must never share a cached copy.
 */
async function key(token: string, repo: RepoRef) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const id = [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return new Request(`https://octo.invalid/config/${id}/${repo.owner}/${repo.name}/${repo.branch}`)
}

export async function cachedConfig(token: string, repo: RepoRef): Promise<string | null> {
  const hit = await caches.default.match(await key(token, repo))
  return hit ? hit.text() : null
}

export async function cacheConfig(token: string, repo: RepoRef, raw: string) {
  await caches.default.put(
    await key(token, repo),
    new Response(raw, { headers: { 'Cache-Control': `max-age=${TTL_SECONDS}` } }),
  )
}

export async function dropCachedConfig(token: string, repo: RepoRef) {
  await caches.default.delete(await key(token, repo))
}
