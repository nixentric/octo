import { useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Copy, File, Folder, LayoutGrid, List, Trash2, Upload } from 'lucide-react'
import { useConfirm } from '@/components/confirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { FileEntry } from '@/core/types'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { useConfig } from '@/features/config/use-config'
import { api } from '@/lib/api'
import { formatBytes } from '@/lib/format'
import { useFetch } from '@/lib/use-fetch'
import { cn } from '@/lib/utils'

type MediaItem = FileEntry & { url?: string }
type MediaResponse = { dir: string; root: string; items: MediaItem[] }

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name)
export const rawUrl = (path: string, sha?: string) => `/api/media/raw?path=${encodeURIComponent(path)}${sha ? `&v=${sha}` : ''}`

/** Map a site-public URL (/images/x.jpg) back to the CMS raw endpoint so previews work before deploy. */
export const publicToRaw = (cfg: { media_dir: string; public_media_path: string }, url: string) =>
  url.startsWith(`${cfg.public_media_path}/`) ? rawUrl(cfg.media_dir + url.slice(cfg.public_media_path.length)) : url

export function MediaPage() {
  const { error: cfgError } = useConfig()
  const [params, setParams] = useSearchParams()
  const confirm = useConfirm()
  const dir = params.get('dir') ?? ''
  const { data, error, loading, refetch } = useFetch<MediaResponse>(cfgError ? null : `/media?dir=${encodeURIComponent(dir)}`)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<MediaItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  if (cfgError) return <div className="p-6"><ConfigNotice /></div>

  const current = data?.dir ?? dir
  const items = (data?.items ?? [])
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  const crumbs = data ? current.slice(data.root.length).split('/').filter(Boolean) : []

  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      setBusy(`Uploading ${file.name}…`)
      const fd = new FormData()
      fd.append('file', file)
      fd.append('dir', current)
      const existing = data?.items.find((i) => i.name === file.name)
      if (existing) {
        const replace = await confirm({
          title: `${file.name} already exists`,
          body: 'Replacing it commits a new version over the current file.',
          confirmLabel: 'Replace',
        })
        if (!replace) continue
        fd.append('sha', existing.sha)
      }
      try {
        await api('/media', { method: 'POST', body: fd })
      } catch (e) {
        await confirm({ title: `Could not upload ${file.name}`, body: (e as Error).message, alert: true })
      }
    }
    setBusy(null)
    refetch()
  }

  async function remove(item: MediaItem) {
    const ok = await confirm({
      title: `Delete ${item.name}?`,
      body: 'This commits the deletion to the repository. Pages still using this file will show a broken image.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setBusy(`Deleting ${item.name}…`)
    try {
      await api('/media', { method: 'DELETE', json: { path: item.path, sha: item.sha } })
      setPreview(null)
    } catch (e) {
      await confirm({ title: 'Could not delete file', body: (e as Error).message, alert: true })
    }
    setBusy(null)
    refetch()
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) upload(e.dataTransfer.files)
  }

  return (
    <div
      className="min-h-full space-y-4 p-6"
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Media</h1>
        <div className="ml-auto flex items-center gap-2">
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
          <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('grid')} aria-label="Grid view"><LayoutGrid /></Button>
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('list')} aria-label="List view"><List /></Button>
          <Button onClick={() => fileInput.current?.click()} disabled={!!busy}><Upload /> Upload</Button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
      </div>

      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <button type="button" className="hover:text-foreground" onClick={() => setParams({})}>{data?.root ?? '…'}</button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <span>/</span>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => setParams({ dir: `${data!.root}/${crumbs.slice(0, i + 1).join('/')}` })}
            >
              {c}
            </button>
          </span>
        ))}
      </nav>

      {busy && <p className="text-sm text-muted-foreground">{busy}</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {loading && !data && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && items.length === 0 && (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No files here. Drop files anywhere to upload.
        </p>
      )}

      {view === 'grid' ? (
        <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6', dragging && 'opacity-50')}>
          {items.map((item) => (
            <button
              key={item.path}
              type="button"
              className="group overflow-hidden rounded-md border text-left hover:border-foreground/40"
              onClick={() => (item.type === 'dir' ? setParams({ dir: item.path }) : setPreview(item))}
            >
              <div className="flex aspect-square items-center justify-center bg-muted">
                {item.type === 'dir' ? (
                  <Folder className="size-8 text-muted-foreground" />
                ) : isImage(item.name) ? (
                  <img src={rawUrl(item.path, item.sha)} alt={item.name} loading="lazy" className="size-full object-cover" />
                ) : (
                  <File className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className="truncate px-2 py-1.5 text-xs" title={item.name}>{item.name}</div>
            </button>
          ))}
        </div>
      ) : (
        <ul className={cn('divide-y rounded-md border text-sm', dragging && 'opacity-50')}>
          {items.map((item) => (
            <li key={item.path} className="flex items-center gap-3 px-3 py-2">
              {item.type === 'dir' ? <Folder className="size-4 text-muted-foreground" /> : <File className="size-4 text-muted-foreground" />}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                onClick={() => (item.type === 'dir' ? setParams({ dir: item.path }) : setPreview(item))}
              >
                {item.name}
              </button>
              <span className="w-20 text-right text-xs text-muted-foreground">{item.type === 'file' ? formatBytes(item.size) : ''}</span>
              {item.url && (
                <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(item.url!)} aria-label="Copy URL"><Copy /></Button>
              )}
              {item.type === 'file' && (
                <Button variant="ghost" size="icon" onClick={() => remove(item)} aria-label="Delete"><Trash2 /></Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          {preview && (
            <div className="space-y-3">
              <DialogTitle className="truncate pr-6">{preview.name}</DialogTitle>
              {isImage(preview.name) ? (
                <img src={rawUrl(preview.path, preview.sha)} alt={preview.name} className="max-h-[60vh] w-full rounded object-contain bg-muted" />
              ) : (
                <div className="flex h-40 items-center justify-center rounded bg-muted"><File className="size-10 text-muted-foreground" /></div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1">{preview.url}</code>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(preview.url!)}><Copy /> Copy URL</Button>
                <Button variant="outline" size="sm" onClick={() => remove(preview)}><Trash2 /> Delete</Button>
              </div>
              <p className="text-xs text-muted-foreground">{preview.path} · {formatBytes(preview.size)}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
