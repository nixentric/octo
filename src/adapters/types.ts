import type { Frontmatter, ParsedEntry } from '@/core/frontmatter'
import type { EntryStatus } from '@/core/types'

export type SiteAdapter = {
  name: string
  defaults: { content_dir: string; media_dir: string; public_media_path: string }
  parse(raw: string): ParsedEntry
  serialize(entry: ParsedEntry): string
  statusOf(data: Frontmatter): EntryStatus
  titleOf(data: Frontmatter, slug: string): string
}
