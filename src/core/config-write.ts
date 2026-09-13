import type { YAMLSeq } from 'yaml'
import type { Field } from './config.ts'

/**
 * Canonical YAML shape for a field: `id` is the frontmatter key, `name` the label.
 * Defaults are omitted so hand-written configs stay short.
 */
export function fieldToYaml(f: Field): Record<string, unknown> {
  const out: Record<string, unknown> = { id: f.id, name: f.label, type: f.type }
  if (f.required) out.required = true
  if (f.default !== undefined) out.default = f.default
  if (f.help) out.help = f.help
  if (f.placeholder) out.placeholder = f.placeholder
  if (f.options?.length) out.options = f.options.map((o) => (o.label === o.value ? o.value : { label: o.label, value: o.value }))
  if (f.min != null) out.min = f.min
  if (f.max != null) out.max = f.max
  if (f.pattern) out.pattern = f.pattern
  if (f.accept?.length) out.accept = f.accept
  if (f.max_size != null) out.max_size = f.max_size
  if (f.panel) out.panel = f.panel
  if (f.fields?.length) out.fields = f.fields.map(fieldToYaml)
  return out
}

const ids = (fields: Field[]) => fields.map((f) => f.id)
const byId = (fields: Field[]) => new Map(fields.map((f) => [f.id, f]))

/** A commit message that says what actually changed, e.g. `cms: add field "price" to services`. */
export function fieldsCommitMessage(collection: string, before: Field[], after: Field[]): string {
  const old = byId(before)
  const next = byId(after)
  const added = ids(after).filter((id) => !old.has(id))
  const removed = ids(before).filter((id) => !next.has(id))
  const changed = ids(after).filter((id) => old.has(id) && JSON.stringify(old.get(id)) !== JSON.stringify(next.get(id)))
  const reordered = added.length === 0 && removed.length === 0 && ids(before).join() !== ids(after).join()

  const single = (verb: string, preposition: string, list: string[]) =>
    list.length === 1 ? `cms: ${verb} field "${list[0]}" ${preposition} ${collection}` : null

  const edits = added.length + removed.length + changed.length
  if (edits === 1) {
    return (
      single('add', 'to', added) ??
      single('remove', 'from', removed) ??
      single('update', 'in', changed)!
    )
  }
  if (edits === 0 && reordered) return `cms: reorder fields in ${collection}`
  return `cms: update fields in ${collection}`
}

/**
 * Rearranges the collections sequence in place, moving the parsed nodes so each
 * collection keeps its own formatting and comments. Returns false when the new
 * order is not a permutation of the current one, which would drop or duplicate
 * a collection.
 */
export function reorderSeq(seq: YAMLSeq, current: string[], next: string[]): boolean {
  const samePermutation =
    next.length === current.length &&
    new Set(next).size === next.length &&
    next.every((name) => current.includes(name))
  if (!samePermutation) return false

  seq.items = next.map((name) => seq.items[current.indexOf(name)])
  return true
}
