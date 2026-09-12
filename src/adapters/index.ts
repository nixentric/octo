import type { CmsConfig, ResolvedConfig } from '@/core/config'
import { hugo } from './hugo'
import type { SiteAdapter } from './types'

const generic: SiteAdapter = {
  ...hugo,
  name: 'generic',
  defaults: { content_dir: 'content', media_dir: 'media', public_media_path: '/media' },
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
