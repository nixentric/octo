import { parseFrontmatter, serializeFrontmatter } from '@/core/frontmatter'
import type { SiteAdapter } from './types'

export const hugo: SiteAdapter = {
  name: 'hugo',
  defaults: { content_dir: 'content', media_dir: 'static/images', public_media_path: '/images' },
  parse: parseFrontmatter,
  serialize: serializeFrontmatter,
  statusOf: (data) => (data.draft === true ? 'draft' : 'published'),
  titleOf: (data, slug) => (typeof data.title === 'string' && data.title) || slug,
}
