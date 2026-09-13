import type { CmsConfig, ResolvedConfig } from '../core/config.ts'
import { hugo } from './hugo.ts'
import type { SiteAdapter } from './types.ts'

const generic: SiteAdapter = {
  ...hugo,
  name: 'generic',
  defaults: { content_dir: 'content', media_dir: 'media', public_media_path: '/media' },
  pathToSlug(folder, path, extension) {
    const ext = `.${extension}`
    if (!path.startsWith(`${folder}/`) || !path.endsWith(ext)) return null
    return path.slice(folder.length + 1, -ext.length)
  },
  entryPaths: (folder, slug, extension) => [`${folder}/${slug}.${extension}`],
  permalink: (contentDir, folder, slug) => {
    const section = folder === contentDir ? '' : folder.slice(contentDir.length + 1)
    return `/${[section, slug].filter(Boolean).join('/')}`
  },
}

export const adapters: Record<CmsConfig['adapter'], SiteAdapter> = { hugo, generic }

export function resolveConfig(cfg: CmsConfig): ResolvedConfig {
  const d = adapters[cfg.adapter].defaults
  return {
    ...cfg,
    content_dir: cfg.content_dir ?? d.content_dir,
    media_dir: cfg.media_dir ?? d.media_dir,
    public_media_path: cfg.public_media_path ?? d.public_media_path,
  }
}
