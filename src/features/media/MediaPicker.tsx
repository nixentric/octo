import { useRef, useState } from 'react'
import { Folder, Upload } from 'lucide-react'
import { useConfirm } from '@/components/confirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { FileEntry } from '@/core/types'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/use-fetch'
import { rawUrl } from './MediaPage'

type MediaItem = FileEntry & { url?: string }
type MediaResponse = { dir: string; root: string; items: MediaItem[] }
const isImage = (name: string) => /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name)

export function MediaPicker({ open, onClose, onPick, imagesOnly = true }: {
  open: boolean
  onClose: () => void
  onPick: (url: string) => void
  imagesOnly?: boolean
}) {
  const [dir, setDir] = useState('')
  const { data, loading, refetch } = useFetch<MediaResponse>(open ? `/media?dir=${encodeURIComponent(dir)}` : null)
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  const fileInput = useRef<HTMLInputElement>(null)

  const items = (data?.items ?? []).filter((i) => i.type === 'dir' || !imagesOnly || isImage(i.name))
  const parent = data && data.dir !== data.root ? data.dir.split('/').slice(0, -1).join('/') : null

  async function upload(file: File) {
    setBusy(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('dir', data?.dir ?? '')
    try {
      const r = await api<{ url: string }>('/media', { method: 'POST', body: fd })
      onPick(r.url)
      onClose()
    } catch (e) {
      await confirm({ title: 'Upload failed', body: (e as Error).message, alert: true })
    } finally {
      setBusy(false)
      refetch()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <div className="flex items-center gap-2">
          <DialogTitle>{imagesOnly ? 'Choose image' : 'Choose file'}</DialogTitle>
          <span className="ml-auto text-xs text-muted-foreground">{data?.dir}</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload /> {busy ? 'Uploading…' : 'Upload'}
          </Button>
          <input ref={fileInput} type="file" {...(imagesOnly ? { accept: 'image/*' } : {})} hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
          {parent !== null && (
            <button type="button" className="flex aspect-square flex-col items-center justify-center rounded border text-xs hover:bg-accent" onClick={() => setDir(parent)}>
              <Folder className="size-6 text-muted-foreground" /> ..
            </button>
          )}
          {items.map((i) =>
            i.type === 'dir' ? (
              <button key={i.path} type="button" className="flex aspect-square flex-col items-center justify-center gap-1 rounded border text-xs hover:bg-accent" onClick={() => setDir(i.path)}>
                <Folder className="size-6 text-muted-foreground" /> <span className="truncate px-1">{i.name}</span>
              </button>
            ) : (
              <button key={i.path} type="button" className="aspect-square overflow-hidden rounded border hover:ring-2 hover:ring-ring" title={i.name} onClick={() => { onPick(i.url!); onClose() }}>
                {isImage(i.name) ? (
                  <img src={rawUrl(i.path, i.sha)} alt={i.name} loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center break-all px-1 text-center text-xs text-muted-foreground">{i.name}</span>
                )}
              </button>
            ),
          )}
          {!loading && items.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
