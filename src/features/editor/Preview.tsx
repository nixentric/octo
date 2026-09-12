import { marked } from 'marked'
import type { Field } from '@/core/config'
import type { Frontmatter } from '@/core/frontmatter'
import { useConfig } from '@/features/config/use-config'

const CSS = `
body{font:16px/1.6 system-ui,sans-serif;color:#111;max-width:44rem;margin:2rem auto;padding:0 1rem}
img{max-width:100%;height:auto} pre{background:#f4f4f4;padding:.75rem;overflow:auto} code{font-size:.9em}
dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem;font-size:.85rem;color:#555;border-bottom:1px solid #ddd;padding-bottom:1rem;margin-bottom:1.5rem}
dt{font-weight:600} h1{margin-bottom:.5rem}`

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function Preview({ fields, data, body }: { fields: Field[]; data: Frontmatter; body: string }) {
  const { config } = useConfig()
  if (!config) return null

  const meta = fields
    .filter((f) => f.name !== 'body' && f.name !== 'title' && data[f.name] != null && data[f.name] !== '')
    .map((f) => `<dt>${esc(f.label ?? f.name)}</dt><dd>${esc(String(data[f.name]))}</dd>`)
    .join('')
  let html = marked.parse(body, { async: false })
  // Site-public media URLs don't exist until deploy — point them at the CMS raw endpoint.
  const raw = `/api/media/raw?path=${encodeURIComponent(config.media_dir)}`
  html = html.replaceAll(`src="${config.public_media_path}/`, `src="${raw}%2F`)

  const doc = `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
<h1>${esc(String(data.title ?? ''))}</h1>${meta ? `<dl>${meta}</dl>` : ''}${html}`

  return <iframe title="Preview" sandbox="allow-same-origin" srcDoc={doc} className="size-full bg-white" />
}
