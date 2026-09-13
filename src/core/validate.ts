import { z } from 'zod'
import { isBodyField, MULTI_CHOICE_TYPES, type Field } from './config.ts'

/** Whether a value counts as "not filled in" for a required check. */
export const isEmpty = (v: unknown) =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

const textRules = (f: Field) => {
  let s = z.string()
  if (f.min != null) s = s.min(f.min, `must be at least ${f.min} characters`)
  if (f.max != null) s = s.max(f.max, `must be at most ${f.max} characters`)
  if (f.pattern) s = s.regex(new RegExp(f.pattern), 'has the wrong format')
  return s
}

const numberRules = (f: Field, int: boolean) => {
  let n = int ? z.number().int('must be a whole number') : z.number()
  if (f.min != null) n = n.min(f.min, `must be ${f.min} or more`)
  if (f.max != null) n = n.max(f.max, `must be ${f.max} or less`)
  return n
}

const listRules = (f: Field, item: z.ZodType) => {
  let a = z.array(item)
  if (f.min != null) a = a.min(f.min, `choose at least ${f.min}`)
  if (f.max != null) a = a.max(f.max, `choose at most ${f.max}`)
  return a
}

function fieldSchema(f: Field): z.ZodType {
  const values = f.options?.map((o) => o.value) ?? []
  switch (f.type) {
    case 'text':
    case 'textarea':
    case 'markdown':
    case 'code':
    case 'time':
      return textRules(f)
    case 'slug':
      return textRules(f).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase words separated by hyphens')
    case 'url':
      return textRules(f).url('must be a valid URL')
    case 'email':
      return textRules(f).email('must be a valid email address')
    case 'color':
      return z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'must be a hex colour like #1a2b3c')
    case 'date':
    case 'datetime':
      return z.string().refine((v) => !isNaN(Date.parse(v)), 'must be a valid date')
    case 'integer':
      return numberRules(f, true)
    case 'decimal':
      return numberRules(f, false)
    case 'boolean':
      return z.boolean()
    case 'select':
    case 'radio':
      return values.length ? z.enum(values as [string, ...string[]]) : z.string()
    case 'multiselect':
    case 'checkbox_group':
      return listRules(f, values.length ? z.enum(values as [string, ...string[]]) : z.string())
    case 'tags':
      return listRules(f, z.string())
    case 'image':
    case 'file':
      return z.string()
    case 'images':
      return listRules(f, z.string())
    case 'key_value':
      return z.record(z.string(), z.string())
    case 'object':
      return entrySchema(f.fields ?? [])
    case 'repeater':
      return listRules(f, entrySchema(f.fields ?? []))
    case 'hidden':
      return z.unknown()
  }
}

/**
 * Validation for one entry's frontmatter. Unknown keys pass through untouched —
 * content may carry fields this collection does not describe.
 */
export function entrySchema(fields: Field[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {}
  for (const f of fields) {
    if (isBodyField(f)) continue
    const base = fieldSchema(f)
    shape[f.id] = f.required ? base : z.union([base, z.literal(''), z.undefined(), z.null()]).optional()
  }
  return z.looseObject(shape)
}

/** Field id → message, for rendering errors next to their input. */
export function validateEntry(fields: Field[], data: Record<string, unknown>, body: string) {
  const errors: Record<string, string> = {}
  for (const f of fields) {
    const value = isBodyField(f) ? body : data[f.id]
    if (f.required && isEmpty(value)) errors[f.id] = 'Required'
  }
  const result = entrySchema(fields).safeParse(data)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const id = String(issue.path[0] ?? '')
      if (id && !errors[id]) errors[id] = issue.message
    }
  }
  return errors
}

export const MULTI_VALUE_TYPES = MULTI_CHOICE_TYPES
