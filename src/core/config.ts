import { z } from 'zod'

export const FIELD_TYPES = [
  // text
  'text', 'textarea', 'markdown',
  // number
  'integer', 'decimal',
  // choice
  'select', 'multiselect', 'radio', 'checkbox_group', 'tags',
  // boolean
  'boolean',
  // date & time
  'date', 'datetime', 'time',
  // media
  'image', 'images', 'file',
  // special
  'url', 'email', 'slug', 'color', 'code', 'hidden',
  // structured
  'object', 'repeater', 'key_value',
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

/** Types whose children are themselves fields. */
export const NESTED_TYPES = ['object', 'repeater'] satisfies FieldType[]
export const CHOICE_TYPES = ['select', 'multiselect', 'radio', 'checkbox_group', 'tags'] satisfies FieldType[]
export const MULTI_CHOICE_TYPES = ['multiselect', 'checkbox_group', 'tags'] satisfies FieldType[]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Short text', textarea: 'Long text', markdown: 'Markdown',
  integer: 'Integer', decimal: 'Decimal',
  select: 'Dropdown', multiselect: 'Multi select', radio: 'Radio', checkbox_group: 'Checkbox group', tags: 'Tags',
  boolean: 'Toggle',
  date: 'Date', datetime: 'Date & time', time: 'Time',
  image: 'Image', images: 'Multiple images', file: 'File',
  url: 'URL', email: 'Email', slug: 'Slug', color: 'Colour', code: 'Code', hidden: 'Hidden',
  object: 'Group', repeater: 'Repeater', key_value: 'Key / value',
}

/** Legacy type names kept working so older config files still load. */
const TYPE_ALIASES: Record<string, FieldType> = {
  number: 'decimal',
  string: 'text',
  bool: 'boolean',
  list: 'tags',
  rich_text: 'markdown',
}

export const FIELD_ID = /^[A-Za-z_][A-Za-z0-9_]*$/

export type Option = { label: string; value: string }

export type Field = {
  /** Key written to frontmatter. Renaming it is a content-breaking change. */
  id: string
  /** Human label shown in the CMS. */
  label: string
  type: FieldType
  required: boolean
  default?: unknown
  help?: string
  placeholder?: string
  options?: Option[]
  /** Children of an object or repeater. */
  fields?: Field[]
  /** Value range for numbers, length for text, selection count for multi-choice. */
  min?: number
  max?: number
  pattern?: string
  accept?: string[]
  max_size?: number
  /** Which column of the editor this field sits in. */
  panel?: 'main' | 'sidebar'
}

/** Short metadata-ish fields sit beside the content rather than interrupting it. */
const SIDEBAR_TYPES: FieldType[] = [
  'boolean', 'date', 'datetime', 'time', 'select', 'radio', 'tags', 'multiselect', 'checkbox_group',
  'image', 'file', 'color', 'slug', 'url', 'email', 'integer', 'decimal', 'hidden',
]
export const fieldPanel = (f: Field): 'main' | 'sidebar' => f.panel ?? (SIDEBAR_TYPES.includes(f.type) ? 'sidebar' : 'main')

const optionSchema = z.object({ label: z.string().min(1), value: z.string() })

export const fieldSchema: z.ZodType<Field> = z.lazy(() =>
  z
    .object({
      id: z.string().regex(FIELD_ID, 'must start with a letter or underscore and use only letters, numbers and underscores'),
      label: z.string().min(1),
      type: z.enum(FIELD_TYPES),
      required: z.boolean().default(false),
      default: z.unknown().optional(),
      help: z.string().optional(),
      placeholder: z.string().optional(),
      options: z.array(optionSchema).optional(),
      fields: z.array(fieldSchema).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      accept: z.array(z.string()).optional(),
      max_size: z.number().optional(),
      panel: z.enum(['main', 'sidebar']).optional(),
    })
    .check((ctx) => {
      const f = ctx.value
      if ((NESTED_TYPES as string[]).includes(f.type) && !f.fields?.length) {
        ctx.issues.push({ code: 'custom', input: f, path: ['fields'], message: `a ${f.type} needs at least one child field` })
      }
      if (f.pattern) {
        try {
          new RegExp(f.pattern)
        } catch {
          ctx.issues.push({ code: 'custom', input: f, path: ['pattern'], message: 'not a valid regular expression' })
        }
      }
      duplicateIds(f.fields).forEach((id) =>
        ctx.issues.push({ code: 'custom', input: f, path: ['fields'], message: `duplicate field id "${id}"` }),
      )
    }),
)

function duplicateIds(fields?: Field[]) {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const f of fields ?? []) (seen.has(f.id) ? dupes : seen).add(f.id)
  return [...dupes]
}

export const collectionSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9_-]+$/),
    label: z.string(),
    /** Sidebar icon, by Lucide name. */
    icon: z.string().optional(),
    /** Sidebar heading this collection is listed under; without one it goes under "Content". */
    group: z.string().optional(),
    folder: z.string().min(1),
    create: z.boolean().default(true),
    extension: z.string().default('md'),
    fields: z.array(fieldSchema).min(1),
  })
  .check((ctx) => {
    duplicateIds(ctx.value.fields).forEach((id) =>
      ctx.issues.push({ code: 'custom', input: ctx.value, path: ['fields'], message: `duplicate field id "${id}"` }),
    )
  })
export type Collection = z.infer<typeof collectionSchema>

export const DEFAULT_GROUP = 'Content'

/**
 * Collections under their sidebar headings. Headings keep the order they first appear in, so
 * dragging collections in Settings orders the headings too; case is ignored when matching.
 */
export function groupCollections<T extends { group?: string }>(collections: T[]) {
  const groups = new Map<string, { name: string; collections: T[] }>()
  for (const c of collections) {
    const name = c.group?.trim() || DEFAULT_GROUP
    const key = name.toLowerCase()
    if (!groups.has(key)) groups.set(key, { name, collections: [] })
    groups.get(key)!.collections.push(c)
  }
  return [...groups.values()]
}

export const configSchema = z.object({
  adapter: z.enum(['hugo', 'generic']).default('hugo'),
  branch: z.string().optional(),
  /** Where the built site is published, so entries can link to their live page. */
  site_url: z.string().url().optional(),
  content_dir: z.string().optional(),
  media_dir: z.string().optional(),
  public_media_path: z.string().optional(),
  collections: z.array(collectionSchema).min(1),
})
export type CmsConfig = z.infer<typeof configSchema>

export type ResolvedConfig = Omit<CmsConfig, 'content_dir' | 'media_dir' | 'public_media_path'> & {
  content_dir: string
  media_dir: string
  public_media_path: string
}

export const CONFIG_PATH = 'cms.config.yml'

type Raw = Record<string, unknown>
const isRaw = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Accepts both spellings of a field so hand-written configs keep working:
 * `{ id, name }` (name is the label) and the older `{ name, label }` (name is the key).
 */
export function normalizeField(raw: unknown): unknown {
  if (!isRaw(raw)) return raw
  const hasId = typeof raw.id === 'string'
  const id = hasId ? raw.id : raw.name
  const label = hasId ? (raw.name ?? raw.label) : (raw.label ?? raw.name)
  const type = typeof raw.type === 'string' ? (TYPE_ALIASES[raw.type] ?? raw.type) : raw.type

  const out: Raw = { ...raw, id, label: label ?? id, type: type ?? 'text' }
  delete out.name
  delete out.hint
  if (raw.help === undefined && typeof raw.hint === 'string') out.help = raw.hint
  if (Array.isArray(raw.options)) out.options = raw.options.map(normalizeOption)
  if (Array.isArray(raw.fields)) out.fields = raw.fields.map(normalizeField)
  return out
}

const normalizeOption = (o: unknown) =>
  typeof o === 'string' || typeof o === 'number'
    ? { label: String(o), value: String(o) }
    : isRaw(o)
      ? { label: String(o.label ?? o.value ?? ''), value: String(o.value ?? o.label ?? '') }
      : o

export function normalizeConfig(raw: unknown): unknown {
  if (!isRaw(raw) || !Array.isArray(raw.collections)) return raw
  return {
    ...raw,
    collections: raw.collections.map((c) =>
      isRaw(c) && Array.isArray(c.fields) ? { ...c, fields: c.fields.map(normalizeField) } : c,
    ),
  }
}

export const parseConfig = (raw: unknown) => configSchema.safeParse(normalizeConfig(raw))

/** The markdown body is stored after the frontmatter, not inside it. */
export const BODY_FIELD = 'body'
export const isBodyField = (f: Field) => f.id === BODY_FIELD && (f.type === 'markdown' || f.type === 'textarea')
