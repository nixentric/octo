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
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return 'time'
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

export type Recommendation = {
  field: Field
  /** How the samples use the key, which is what decided the type. */
  habit: string
  /** How many samples hold a value for it. */
  uses: number
}

const HABITS: Partial<Record<FieldType, string>> = {
  boolean: 'Always true or false',
  integer: 'Always a whole number',
  decimal: 'Numbers with decimals',
  date: 'Always a date',
  datetime: 'Dates with a time',
  time: 'Always a time of day',
  image: 'Always an image path',
  images: 'Lists of image paths',
  url: 'Always a web address',
  email: 'Always an email address',
  color: 'Always a hex colour',
  tags: 'Lists of words',
  textarea: 'Long or multi-line text',
}

const quoted = (values: string[]) =>
  values.slice(0, 3).map((v) => `“${v}”`).join(', ') + (values.length > 3 ? ', …' : '')

/**
 * A parameter for each key, typed from how the samples use it. Unlike inferFields it reads
 * repetition too, since someone reviews these before they are saved: values that are all keys of a
 * source (like a data file) pick from it, and a few values that keep coming back make a dropdown.
 */
export function recommendFields(samples: Frontmatter[], sources: { from: string; label?: string; keys: string[] }[] = []): Recommendation[] {
  return inferFields(samples, false).map((field) => {
    const values = samples.map((s) => s[field.id]).filter((v) => v != null)
    const uses = values.length
    const distinct = [...new Set(values.flatMap((v) => (Array.isArray(v) ? v : [v])).map(String))]
    const { options: _, ...bare } = field
    const list = field.type === 'tags'
    const words = field.type === 'text' && values.every((v) => typeof v === 'string')

    const source = (list || words) && distinct.length > 0 && sources.find((s) => distinct.every((v) => s.keys.includes(v)))
    if (source) {
      return { field: { ...bare, type: list ? 'multiselect' : 'select', options_from: source.from }, habit: `Always keys from ${source.label ?? source.from}`, uses }
    }
    if (words && uses >= 4 && distinct.length >= 2 && distinct.length <= Math.min(10, uses / 2)) {
      const options = distinct.map((v) => ({ label: v, value: v }))
      return { field: { ...bare, type: 'select', options }, habit: `Only ${distinct.length} different values: ${quoted(distinct)}`, uses }
    }
    const habit = HABITS[field.type]
      ?? (!words ? 'Mixed kinds of values' : uses < 2 ? 'Short text' : distinct.length === 1 ? `Always ${quoted(distinct)}` : 'Short text that varies')
    return { field, habit, uses }
  })
}

export const STARTER_FIELDS: Field[] = [
  { id: 'title', label: 'Title', type: 'text', required: true },
  { id: 'description', label: 'Description', type: 'textarea', required: false },
  { id: 'image', label: 'Featured Image', type: 'image', required: false },
  { id: 'date', label: 'Publish Date', type: 'datetime', required: false },
  { id: 'draft', label: 'Draft', type: 'boolean', required: false },
  { id: 'body', label: 'Content', type: 'markdown', required: false },
]

/** Parameters every collection gets, whether or not its entries use them yet. */
const CORE_FIELD_IDS = ['title', 'date', 'draft', 'body']

export const missingCoreFields = (fields: Field[]) =>
  STARTER_FIELDS.filter((f) => CORE_FIELD_IDS.includes(f.id) && !fields.some((x) => x.id === f.id))

/** Adds the missing core fields around the existing ones: title first, date and draft before the body, body last. */
export function withCoreFields(fields: Field[]): Field[] {
  const missing = missingCoreFields(fields)
  const add = (id: string) => missing.filter((f) => f.id === id)
  return [
    ...add('title'),
    ...fields.filter((f) => f.id !== 'body'),
    ...add('date'),
    ...add('draft'),
    ...fields.filter((f) => f.id === 'body'),
    ...add('body'),
  ]
}

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

