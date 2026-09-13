import { Hono } from 'hono'
import { z } from 'zod'
import type { ResolvedConfig } from '@/core/config'
import type { AppEnv } from '../../env'
import { withConfig, withRepo } from './middleware'

/** Files under the configured media directory: listing, serving, uploading and deleting. */
export const mediaRoutes = new Hono<AppEnv>()

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', pdf: 'application/pdf', mp4: 'video/mp4',
}
const mimeOf = (path: string) => MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
const inMedia = (cfg: ResolvedConfig, p: string) => !p.includes('..') && (p === cfg.media_dir || p.startsWith(`${cfg.media_dir}/`))
const publicUrl = (cfg: ResolvedConfig, path: string) => cfg.public_media_path + path.slice(cfg.media_dir.length)

mediaRoutes.get('/media/raw', withRepo, async (c) => {
  const path = c.req.query('path')
  if (!path || path.includes('..')) return c.json({ error: 'Invalid path' }, 400)
  const buf = await c.get('git').getFileRaw(path, c.req.query('ref'))
  return new Response(buf, {
    headers: {
      'Content-Type': mimeOf(path),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    },
  })
})

mediaRoutes.get('/media', withRepo, withConfig, async (c) => {
  const cfg = c.get('config')
  const dir = c.req.query('dir') || cfg.media_dir
  if (!inMedia(cfg, dir)) return c.json({ error: 'Invalid directory' }, 400)
  const files = await c.get('git').listFiles(dir)
  const items = files.map((f) => ({ ...f, url: f.type === 'file' ? publicUrl(cfg, f.path) : undefined }))
  return c.json({ dir, root: cfg.media_dir, items })
})

mediaRoutes.post('/media', withRepo, withConfig, async (c) => {
  const cfg = c.get('config')
  const body = await c.req.parseBody()
  const file = body.file
  const dir = typeof body.dir === 'string' && body.dir ? body.dir : cfg.media_dir
  if (!(file instanceof File)) return c.json({ error: 'Missing file' }, 400)
  if (!inMedia(cfg, dir)) return c.json({ error: 'Invalid directory' }, 400)
  const name = file.name.replace(/[^\w.-]+/g, '-')
  const path = `${dir}/${name}`
  const r = await c.get('git').uploadFile({
    path,
    bytes: new Uint8Array(await file.arrayBuffer()),
    sha: typeof body.sha === 'string' ? body.sha : undefined,
    message: `cms: upload ${mimeOf(name).startsWith('image/') ? 'image' : 'file'} "${name}"`,
  })
  return c.json({ path, name, sha: r.sha, url: publicUrl(cfg, path) }, 201)
})

mediaRoutes.delete('/media', withRepo, withConfig, async (c) => {
  const cfg = c.get('config')
  const p = z.object({ path: z.string(), sha: z.string().min(1) }).safeParse(await c.req.json())
  if (!p.success || !inMedia(cfg, p.data.path)) return c.json({ error: 'Invalid body' }, 400)
  await c.get('git').deleteFile({
    path: p.data.path,
    sha: p.data.sha,
    message: `cms: delete file "${p.data.path.split('/').pop()}"`,
  })
  return c.json({ ok: true })
})
