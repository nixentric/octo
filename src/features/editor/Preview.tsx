import { marked } from 'marked'
import { isBodyField, type Field } from '@/core/config'
import type { Frontmatter } from '@/core/frontmatter'
import { useConfig } from '@/features/config/use-config'
import { useTheme } from '@/lib/theme'

const CSS = `
:root{color-scheme:light;--fg:#111;--bg:#fff;--muted:#555;--rule:#ddd;--code:#f4f4f4}
:root.dark{color-scheme:dark;--fg:#fafafa;--bg:#000;--muted:#a1a1a1;--rule:#2e2e2e;--code:#161616}
body{font:16px/1.6 system-ui,sans-serif;color:var(--fg);background:var(--bg);max-width:44rem;margin:2rem auto;padding:0 1rem}
img{max-width:100%;height:auto} pre{background:var(--code);padding:.75rem;overflow:auto} code{font-size:.9em}
dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem;font-size:.85rem;color:var(--muted);border-bottom:1px solid var(--rule);padding-bottom:1rem;margin-bottom:1.5rem}
dt{font-weight:600} h1{margin-bottom:.5rem}`

const display = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v ? JSON.stringify(v) : String(v))

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function Preview({ fields, data, body }: { fields: Field[]; data: Frontmatter; body: string }) {
  const { config } = useConfig()
  const { resolved } = useTheme()
  if (!config) return null

  const meta = fields
    .filter((f) => !isBodyField(f) && f.id !== 'title' && data[f.id] != null && data[f.id] !== '')
    .map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(display(data[f.id]))}</dd>`)
    .join('')
  let html = marked.parse(body, { async: false })
  // Site-public media URLs don't exist until deploy — point them at the CMS raw endpoint.
  const raw = `/api/media/raw?path=${encodeURIComponent(config.media_dir)}`
  html = html.replaceAll(`src="${config.public_media_path}/`, `src="${raw}%2F`)

  const doc = `<!doctype html><html class="${resolved}"><meta charset="utf-8"><style>${CSS}</style>
<h1>${esc(String(data.title ?? ''))}</h1>${meta ? `<dl>${meta}</dl>` : ''}${html}`

  return <iframe title="Preview" sandbox="allow-same-origin" srcDoc={doc} className="size-full bg-background" />
}
