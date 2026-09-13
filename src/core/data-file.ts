import { stringify as stringifyToml } from 'smol-toml'
import YAML from 'yaml'
import type { Field } from './config.ts'
import { inferFields } from './generate-config.ts'
import { isToml, isYaml, parseDataFile } from './options.ts'

/** One key of a data file and the values under it. */
export type DataEntry = { key: string; values: Record<string, unknown> }

/** Keys double as slugs in templates and URLs. */
export const DATA_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The entries of a data file kept as a map keyed by slug. A bare value (`web: Web`) reads as the
 * first field. Any other shape, such as a list, is not editable yet and gives null.
 */
export function readEntries(data: unknown, fields: Field[]): DataEntry[] | null {
  if (data == null) return []
  if (!isPlain(data)) return null
  const first = fields[0]?.id ?? 'name'
  return Object.entries(data).map(([key, v]) => ({ key, values: isPlain(v) ? v : v == null ? {} : { [first]: v } }))
}

/** Fields for a data file, guessed from the values already in it; `name` leads, as registries use it for the label. */
export function inferDataFields(entries: DataEntry[]): Field[] {
  const fields = inferFields(entries.map((e) => e.values), false)
  const name = fields.find((f) => f.id === 'name') ?? { id: 'name', label: 'Name', type: 'text' as const, required: false }
  return [{ ...name, required: true }, ...fields.filter((f) => f.id !== 'name')]
}

const defined = (values: Record<string, unknown>, ids: string[]) =>
  Object.fromEntries(ids.filter((id) => values[id] !== undefined && values[id] !== '').map((id) => [id, values[id]]))

/**
 * Writes entries into the parsed YAML document in place, so comments, key order and the file's
 * style survive. Keys that are gone are removed; fields the schema knows are set, changed or
 * cleared; fields it does not know are left alone; new keys follow the style of the ones there.
 */
export function applyEntries(doc: YAML.Document, fields: Field[], entries: DataEntry[]) {
  const ids = fields.map((f) => f.id)
  const contents = doc.contents
  let map: YAML.YAMLMap
  if (YAML.isMap(contents) && !(contents.flow && contents.items.length === 0)) {
    map = contents
  } else {
    // An empty or comment-only file, or a bare `{}`: start a block map where the old contents sat.
    map = doc.createNode({}) as YAML.YAMLMap
    map.commentBefore = (contents as YAML.Node | null)?.commentBefore
    doc.contents = map
  }

  const keep = new Set(entries.map((e) => e.key))
  for (const item of [...map.items]) {
    const key = YAML.isScalar(item.key) ? String(item.key.value) : String(item.key)
    if (!keep.has(key)) map.delete(key)
  }

  const flow = map.items.some((item) => YAML.isMap(item.value) && item.value.flow)
  // Registries often leave a blank line between entries; new ones follow suit.
  const spaced = map.items.slice(1).some((item) => YAML.isNode(item.key) && item.key.spaceBefore)
  for (const { key, values } of entries) {
    const node = map.get(key, true)
    const next = defined(values, ids)
    if (YAML.isMap(node)) {
      for (const id of ids) {
        if (!(id in next)) node.delete(id)
        else if (JSON.stringify(node.get(id)) !== JSON.stringify(next[id])) node.set(id, doc.createNode(next[id]))
      }
      continue
    }
    // A bare value that still holds just its first field stays bare.
    const keys = Object.keys(next)
    if (YAML.isScalar(node) && keys.length === 1 && keys[0] === ids[0] && node.value === next[ids[0]]) continue
    const created = doc.createNode(next) as YAML.YAMLMap
    if (flow) created.flow = true
    if (YAML.isNode(node) || map.has(key)) {
      map.set(key, created)
    } else {
      const pair = doc.createPair(key, created)
      if (spaced && map.items.length) (pair.key as YAML.Scalar).spaceBefore = true
      map.items.push(pair)
    }
  }
}

/** The same rules as applyEntries on a plain object, for formats that are written back whole. */
export function entriesToObject(current: unknown, fields: Field[], entries: DataEntry[]): Record<string, unknown> {
  const ids = fields.map((f) => f.id)
  const before = isPlain(current) ? current : {}
  return Object.fromEntries(
    entries.map(({ key, values }) => {
      const old = before[key]
      const next = defined(values, ids)
      const keys = Object.keys(next)
      if (old != null && !isPlain(old) && keys.length === 1 && keys[0] === ids[0] && old === next[ids[0]]) return [key, old]
      const unknown = isPlain(old) ? Object.fromEntries(Object.entries(old).filter(([k]) => !ids.includes(k))) : {}
      return [key, { ...next, ...unknown }]
    }),
  )
}

/**
 * The file's new text. YAML is edited in place and keeps its comments; JSON and TOML are
 * written back whole, so a TOML file loses its comments.
 */
export function writeDataFile(path: string, content: string, fields: Field[], entries: DataEntry[]): string {
  if (isYaml(path)) {
    const doc = YAML.parseDocument(content)
    applyEntries(doc, fields, entries)
    return doc.toString()
  }
  const next = entriesToObject(content.trim() ? parseDataFile(path, content) : {}, fields, entries)
  return isToml(path) ? `${stringifyToml(next)}\n` : `${JSON.stringify(next, null, 2)}\n`
}
