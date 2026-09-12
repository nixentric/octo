import YAML from 'yaml'

export type Frontmatter = Record<string, unknown>
export type ParsedEntry = { data: Frontmatter; body: string }

const RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parseFrontmatter(raw: string): ParsedEntry {
  const m = RE.exec(raw)
  if (!m) return { data: {}, body: raw }
  const data = YAML.parse(m[1])
  return { data: data && typeof data === 'object' ? data : {}, body: m[2] }
}

export function serializeFrontmatter({ data, body }: ParsedEntry): string {
  if (Object.keys(data).length === 0) return body
  return `---\n${YAML.stringify(data)}---\n${body}`
}
