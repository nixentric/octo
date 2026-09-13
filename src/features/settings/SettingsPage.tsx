import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { GripVertical, Link2, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/confirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CONFIG_PATH, type Collection, type ResolvedConfig } from '@/core/config'
import { slugify } from '@/core/slug'
import { useSession } from '@/features/auth/session'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { useConfig } from '@/features/config/use-config'
import { api } from '@/lib/api'
import { move, useDragList } from '@/lib/use-drag-list'
import { cn } from '@/lib/utils'
import { FolderInput } from './FolderInput'

type SiteSettings = Pick<ResolvedConfig, 'adapter' | 'content_dir' | 'media_dir' | 'public_media_path'>

export function SettingsPage() {
  const { me, refresh } = useSession()
  const { config, refetch } = useConfig()
  const navigate = useNavigate()
  const confirm = useConfirm()

  async function disconnect() {
    const ok = await confirm({
      title: 'Disconnect this repository?',
      body: 'Your content stays in the repository. You can connect it again at any time.',
      confirmLabel: 'Disconnect',
    })
    if (!ok) return
    await api('/repo', { method: 'DELETE' })
    await refresh()
    navigate('/connect', { replace: true })
  }

  return (
    <div className="max-w-2xl space-y-10 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Repository</h2>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Repository</dt><dd>{me?.repo?.owner}/{me?.repo?.name}</dd>
          <dt className="text-muted-foreground">Branch</dt><dd>{me?.repo?.branch}</dd>
        </dl>
        <Button variant="outline" size="sm" onClick={disconnect}>Disconnect repository</Button>
      </section>

      <ConfigNotice />
      {config && <SiteSection config={config} onSaved={refetch} />}
      {config && <CollectionsSection config={config} onChanged={refetch} />}
    </div>
  )
}

function SiteSection({ config, onSaved }: { config: ResolvedConfig; onSaved: () => void }) {
  const initial: SiteSettings = {
    adapter: config.adapter,
    content_dir: config.content_dir,
    media_dir: config.media_dir,
    public_media_path: config.public_media_path,
  }
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraft(initial), [config]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const set = (patch: Partial<SiteSettings>) => setDraft((d) => ({ ...d, ...patch }))

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await api('/config', { method: 'PATCH', json: draft })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Site configuration</h2>
        <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="adapter">Site generator</Label>
          <Select value={draft.adapter} onValueChange={(v) => set({ adapter: v as SiteSettings['adapter'] })}>
            <SelectTrigger id="adapter" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hugo">Hugo</SelectItem>
              <SelectItem value="generic">Generic Markdown</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <PickerField id="content_dir" label="Content directory" value={draft.content_dir} onChange={(v) => set({ content_dir: v })} help="Where entry folders live." />
        <PickerField id="media_dir" label="Media directory" value={draft.media_dir} onChange={(v) => set({ media_dir: v })} help="Where uploads are committed." />
        <div className="space-y-1.5">
          <Label htmlFor="public_media_path">Public media path</Label>
          <div className="flex items-center gap-2">
            {/* No picker: this is the URL the files get on the live site, not a
                path in the repository, so there is nothing to list. */}
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <Input
              id="public_media_path"
              className="font-mono"
              value={draft.public_media_path}
              onChange={(e) => set({ public_media_path: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">The URL prefix those files get on the live site.</p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Saved to <code>{CONFIG_PATH}</code> in the repository.</p>
    </section>
  )
}

function PickerField({ id, label, value, onChange, help }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  help?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <FolderInput id={id} value={value} onChange={onChange} />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}


type Draft = { name: string; label: string; folder: string }

function CollectionsSection({ config, onChanged }: { config: ResolvedConfig; onChanged: () => void }) {
  const [editing, setEditing] = useState<{ draft: Draft; existing?: Collection } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()
  const firstField = useRef<HTMLInputElement>(null)
  // Dragging reorders locally first so the row follows the cursor, then commits.
  const [order, setOrder] = useState<Collection[] | null>(null)
  const collections = order ?? config.collections

  const drag = useDragList(async (from, to) => {
    const next = move(collections, from, to)
    setOrder(next)
    try {
      await api('/config/collections/order', { method: 'PUT', json: { names: next.map((c) => c.name) } })
      onChanged()
    } catch (e) {
      // Usually means the config moved on elsewhere, so pull the current one back.
      setOrder(null)
      onChanged()
      await confirm({ title: 'Could not save the new order', body: (e as Error).message, alert: true })
    }
  })

  useEffect(() => setOrder(null), [config])

  async function remove(col: Collection) {
    const ok = await confirm({
      title: `Remove "${col.label}" from the CMS?`,
      body: `The ${col.folder} folder and everything in it stays in your repository — only this collection's entry in the configuration is removed.`,
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    try {
      await api(`/config/collections/${col.name}`, { method: 'DELETE' })
      onChanged()
    } catch (e) {
      await confirm({ title: 'Could not remove the collection', body: (e as Error).message, alert: true })
    }
  }

  async function save() {
    if (!editing) return
    const { draft, existing } = editing
    setBusy(true)
    setError(null)
    try {
      if (existing) {
        await api(`/config/collections/${existing.name}`, { method: 'PATCH', json: { label: draft.label, folder: draft.folder } })
      } else {
        await api('/config/collections', { method: 'POST', json: draft })
      }
      setEditing(null)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const startAdd = () => {
    setError(null)
    setEditing({ draft: { name: '', label: '', folder: '' } })
  }
  const startEdit = (col: Collection) => {
    setError(null)
    setEditing({ draft: { name: col.name, label: col.label, folder: col.folder }, existing: col })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Collections</h2>
          <p className="text-xs text-muted-foreground">Drag to set the order they appear in the sidebar.</p>
        </div>
        <Button size="sm" variant="outline" onClick={startAdd}><Plus /> Add collection</Button>
      </div>

      <ul className="divide-y rounded-md border">
        {collections.map((col, i) => (
          <li
            key={col.name}
            {...drag.rowProps(i)}
            className={cn(
              // No dimming of the source row: the browser already draws a
              // translucent copy under the cursor, and both at once reads as a glitch.
              'flex flex-wrap items-center gap-2 bg-background px-3 py-2 text-sm',
              drag.over === i && drag.from !== i && 'relative z-10 ring-2 ring-ring',
            )}
          >
            <span {...drag.handleProps} className="cursor-grab text-muted-foreground" aria-hidden><GripVertical className="size-4" /></span>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => startEdit(col)}>
              <div className="font-medium">{col.label}</div>
              <code className="text-xs text-muted-foreground">{col.folder}</code>
            </button>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/settings/collections/${col.name}`}>
                <SlidersHorizontal /> {col.fields.length} parameters
              </Link>
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Remove ${col.label}`} onClick={() => remove(col)}><Trash2 /></Button>
          </li>
        ))}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent
          className="max-w-md"
          onOpenAutoFocus={(e) => {
            // Radix picks its own target; the name field is the one to start in.
            e.preventDefault()
            firstField.current?.focus()
          }}
        >
          <DialogTitle>{editing?.existing ? `Edit ${editing.existing.label}` : 'Add a collection'}</DialogTitle>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="col-label">Name</Label>
                <Input
                  id="col-label"
                  ref={firstField}
                  value={editing.draft.label}
                  placeholder="Services"
                  onChange={(e) => {
                    const label = e.target.value
                    setEditing((s) => {
                      if (!s) return s
                      if (s.existing) return { ...s, draft: { ...s.draft, label } }
                      const name = slugify(label)
                      return { ...s, draft: { label, name, folder: name ? `${config.content_dir}/${name}` : '' } }
                    })
                  }}
                />
                <p className="text-xs text-muted-foreground">Shown in the sidebar.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="col-folder">Folder</Label>
                <FolderInput
                  id="col-folder"
                  value={editing.draft.folder}
                  placeholder={`${config.content_dir}/services`}
                  onChange={(folder) => setEditing((s) => (s ? { ...s, draft: { ...s.draft, folder } } : s))}
                />
                <p className="text-xs text-muted-foreground">
                  {editing.existing
                    ? 'Pointing at a different folder does not move any files.'
                    : 'Created on the first entry you save — it does not need to exist yet.'}
                </p>
              </div>

              {!editing.existing && (
                <p className="text-xs text-muted-foreground">
                  URL and config key: <code>{editing.draft.name || '…'}</code>
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={busy || !editing.draft.label.trim() || !editing.draft.folder.trim()}>
                  {busy ? 'Saving…' : editing.existing ? 'Save' : 'Add collection'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
