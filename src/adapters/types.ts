import type { Frontmatter, ParsedEntry } from '../core/frontmatter.ts'
import type { EntryStatus } from '../core/types.ts'

export type SiteAdapter = {
  name: string
  defaults: { content_dir: string; media_dir: string; public_media_path: string }
  parse(raw: string): ParsedEntry
  serialize(entry: ParsedEntry): string
  statusOf(data: Frontmatter): EntryStatus
  titleOf(data: Frontmatter, slug: string): string
  /** File path within a collection → entry slug, or null when the file is not an entry. */
  pathToSlug(folder: string, path: string, extension: string): string | null
  /** Paths a slug may live at, most likely first. */
  entryPaths(folder: string, slug: string, extension: string): string[]
}
