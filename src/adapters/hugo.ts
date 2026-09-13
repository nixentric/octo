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
}
