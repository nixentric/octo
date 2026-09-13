import { parseFrontmatter, serializeFrontmatter } from '../core/frontmatter.ts'
import type { SiteAdapter } from './types.ts'

export const hugo: SiteAdapter = {
  name: 'hugo',
  defaults: { content_dir: 'content', media_dir: 'static/images', public_media_path: '/images' },
  parse: parseFrontmatter,
  serialize: serializeFrontmatter,
  statusOf: (data) => (data.draft === true ? 'draft' : 'published'),
  titleOf: (data, slug) => (typeof data.title === 'string' && data.title) || slug.split('/').pop() || slug,

  // Hugo pages are either a single file (posts/promo.md) or a leaf bundle holding
  // the page's own assets (posts/promo/index.md). _index.md is the section's own
  // list page, which is not an entry in the collection.
  pathToSlug(folder, path, extension) {
    const ext = `.${extension}`
    if (!path.startsWith(`${folder}/`) || !path.endsWith(ext)) return null
    const rel = path.slice(folder.length + 1, -ext.length)
    const name = rel.split('/').pop()!
    if (name.startsWith('_index')) return null
    if (name === 'index') return rel.slice(0, -'index'.length - 1) || null
    return rel
  },

  entryPaths: (folder, slug, extension) => [
    `${folder}/${slug}.${extension}`,
    `${folder}/${slug}/index.${extension}`,
  ],

  // Hugo's default permalink is /<section>/<slug>/. Frontmatter wins where it
  // sets one, but a site with custom `permalinks` rules can still differ — this
  // is a best guess, not a promise.
  permalink(contentDir, folder, slug, data) {
    if (typeof data.url === 'string' && data.url) return ensureSlashes(data.url)
    const section = folder === contentDir ? '' : folder.slice(contentDir.length + 1)
    const parts = slug.split('/')
    if (typeof data.slug === 'string' && data.slug) parts[parts.length - 1] = data.slug
    return ensureSlashes([section, ...parts].filter(Boolean).join('/').toLowerCase())
  },
}

const ensureSlashes = (path: string) => `/${path.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')
