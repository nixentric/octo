import { z } from 'zod'

export const WIDGET_TYPES = [
  'text', 'textarea', 'number', 'boolean', 'select', 'multiselect', 'datetime', 'image', 'markdown',
] as const
export type WidgetType = (typeof WIDGET_TYPES)[number]

export const fieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(WIDGET_TYPES).default('text'),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
  hint: z.string().optional(),
  options: z.array(z.string()).optional(),
})
export type Field = z.infer<typeof fieldSchema>

export const collectionSchema = z.object({
  name: z.string().regex(/^[a-z0-9_-]+$/),
  label: z.string(),
  folder: z.string().min(1),
  create: z.boolean().default(true),
  extension: z.string().default('md'),
  fields: z.array(fieldSchema).min(1),
})
export type Collection = z.infer<typeof collectionSchema>

export const configSchema = z.object({
  adapter: z.enum(['hugo', 'generic']).default('hugo'),
  branch: z.string().optional(),
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
