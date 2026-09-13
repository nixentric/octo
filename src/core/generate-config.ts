import type { CmsConfig, Field, FieldType } from './config.ts'
import type { Frontmatter } from './frontmatter.ts'

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]|$)/

/** Turns a frontmatter key into a readable label: `starting_price` → `Starting Price`. */
export const labelFor = (id: string) =>
  id.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase())

function typeOf(value: unknown): FieldType | null {
  if (value == null) return null
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'decimal'
  if (value instanceof Date) return 'datetime'
  if (Array.isArray(value)) return value.every((v) => typeof v === 'string' && IMAGE.test(v)) && value.length ? 'images' : 'tags'
  if (typeof value === 'object') return 'object'
  const s = String(value)
  if (ISO_DATE.test(s)) return s.length <= 10 ? 'date' : 'datetime'
  if (IMAGE.test(s)) return 'image'
  if (/^https?:\/\//.test(s)) return 'url'
  if (/^[^@\s]+@[^@\s]+\.\w+$/.test(s)) return 'email'
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return 'color'
  return s.length > 90 || s.includes('\n') ? 'textarea' : 'text'
}

/** The most specific type that fits every sample; falls back to text when they disagree. */
function mergeTypes(types: FieldType[]): FieldType {
  const distinct = [...new Set(types)]
  if (distinct.length === 1) return distinct[0]
  if (distinct.every((t) => t === 'integer' || t === 'decimal')) return 'decimal'
  if (distinct.every((t) => t === 'date' || t === 'datetime')) return 'datetime'
  if (distinct.every((t) => t === 'text' || t === 'textarea')) return 'textarea'
  return 'text'
}

/**
 * Derives a collection's fields from the frontmatter already in its entries.
 * A key present in every sample is treated as required.
 */
export function inferFields(samples: Frontmatter[], hasBody: boolean): Field[] {
  const seen = new Map<string, unknown[]>()
  for (const sample of samples) {
    for (const [id, value] of Object.entries(sample)) {
      if (!seen.has(id)) seen.set(id, [])
      if (value != null) seen.get(id)!.push(value)
    }
  }

  const fields: Field[] = []
  for (const [id, values] of seen) {
    const types = values.map(typeOf).filter((t): t is FieldType => t !== null)
    if (!types.length) continue
    const type = mergeTypes(types)
    const field: Field = {
      id,
      label: labelFor(id),
      type,
      required: id === 'title' && values.length === samples.length,
    }
    if (type === 'tags') {
      const options = [...new Set(values.flatMap((v) => (Array.isArray(v) ? v.map(String) : [])))].slice(0, 20)
      if (options.length) field.options = options.map((o) => ({ label: o, value: o }))
    }
    if (type === 'object') continue // nested shapes are better described by hand
    fields.push(field)
  }

  fields.sort((a, b) => Number(b.id === 'title') - Number(a.id === 'title'))
  if (hasBody) fields.push({ id: 'body', label: 'Content', type: 'markdown', required: false })
  return fields
}

export const STARTER_FIELDS: Field[] = [
  { id: 'title', label: 'Title', type: 'text', required: true },
  { id: 'description', label: 'Description', type: 'textarea', required: false },
  { id: 'image', label: 'Featured Image', type: 'image', required: false },
  { id: 'date', label: 'Publish Date', type: 'datetime', required: false },
  { id: 'draft', label: 'Draft', type: 'boolean', required: false },
  { id: 'body', label: 'Content', type: 'markdown', required: false },
]

export type DetectedSite = {
  adapter: CmsConfig['adapter']
  content_dir: string
  media_dir: string
  public_media_path: string
}

const HUGO_MARKERS = ['hugo.toml', 'hugo.yaml', 'hugo.yml', 'hugo.json', 'config.toml', 'config/_default/hugo.toml', 'config/_default/config.toml']

/** Guesses the site generator and its conventional directories from the files present. */
export function detectSite(paths: string[]): DetectedSite {
  const has = (p: string) => paths.includes(p)
  const inDir = (d: string) => paths.some((p) => p.startsWith(`${d}/`))

  if (HUGO_MARKERS.some(has) || (inDir('content') && inDir('static'))) {
    return {
      adapter: 'hugo',
      content_dir: 'content',
      media_dir: inDir('static/images') ? 'static/images' : inDir('static/img') ? 'static/img' : 'static/images',
      public_media_path: inDir('static/img') ? '/img' : '/images',
    }
  }

  const content = ['content', 'src/content', 'posts', '_posts'].find(inDir) ?? 'content'
  const media = ['static/images', 'public/images', 'assets/images', 'images'].find(inDir) ?? 'public/images'
  return {
    adapter: 'generic',
    content_dir: content,
    media_dir: media,
    public_media_path: `/${media.split('/').pop()}`,
  }
}

/** Folders directly under the content directory that hold markdown entries. */
export function detectCollections(paths: string[], contentDir: string, extension = 'md') {
  const folders = new Map<string, string[]>()
  for (const path of paths) {
    if (!path.startsWith(`${contentDir}/`) || !path.endsWith(`.${extension}`)) continue
    const rest = path.slice(contentDir.length + 1)
    const segments = rest.split('/')
    const folder = segments.length > 1 ? `${contentDir}/${segments[0]}` : contentDir
    if (segments.at(-1)!.startsWith('_index')) continue
    if (!folders.has(folder)) folders.set(folder, [])
    folders.get(folder)!.push(path)
  }
  return [...folders]
    .map(([folder, files]) => ({
      name: (folder === contentDir ? 'pages' : folder.split('/').pop()!).toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
      label: labelFor(folder === contentDir ? 'pages' : folder.split('/').pop()!),
      folder,
      files,
    }))
    .sort((a, b) => b.files.length - a.files.length)
}
