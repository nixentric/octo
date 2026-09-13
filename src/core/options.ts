import { parse as parseToml } from 'smol-toml'
import YAML from 'yaml'
import type { Option } from './config.ts'

/** A file options or data entries can be read from. */
export const isDataFile = (path: string) => /\.(ya?ml|json|toml)$/i.test(path)
export const isToml = (path: string) => /\.toml$/i.test(path)
export const isYaml = (path: string) => /\.ya?ml$/i.test(path)

/** Parsed by extension: TOML, or YAML, which reads JSON as well. */
export const parseDataFile = (path: string, content: string): unknown =>
  isToml(path) ? parseToml(content) : YAML.parse(content)

/**
 * Worth suggesting as a data file. Sites keep these in different places (data/, _data/,
 * src/data/), so any folder counts; files at the root are the tooling's own config, and
 * hidden folders, dependencies and lockfiles are never data.
 */
export const isDataCandidate = (path: string) =>
  path.includes('/') && !/(^|\/)(\.|node_modules\/)/.test(path) && !/(^|\/)(pnpm-lock\.yaml|package-lock\.json)$/.test(path)

const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined)

const nameOf = (v: unknown) => {
  if (!v || typeof v !== 'object') return text(v)
  const o = v as Record<string, unknown>
  return text(o.name) ?? text(o.title) ?? text(o.label)
}

/**
 * Options from a parsed data file, in the shapes Hugo sites keep registries in: a map keyed
 * by slug (`windows: { name: Windows }`, the key is written and the name shown), or a list of
 * names or objects.
 */
export function optionsFromData(data: unknown): Option[] {
  if (Array.isArray(data)) {
    return data.flatMap((item) => {
      const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const value = text(item) ?? text(o.value) ?? text(o.slug) ?? text(o.id) ?? text(o.key) ?? nameOf(item)
      return value === undefined ? [] : [{ value, label: nameOf(item) ?? value }]
    })
  }
  if (data && typeof data === 'object') {
    return Object.entries(data).map(([key, v]) => ({ value: key, label: nameOf(v) ?? key }))
  }
  return []
}
