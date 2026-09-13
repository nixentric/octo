import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight, ExternalLink, Globe, GripVertical, Link2, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { CollectionIcon } from '@/components/CollectionIcon'
import { useConfirm } from '@/components/confirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CONFIG_PATH, type Collection, type ResolvedConfig } from '@/core/config'
import { labelFor } from '@/core/generate-config'
import { slugify } from '@/core/slug'
import { useSession } from '@/features/auth/session'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { useConfig } from '@/features/config/use-config'
import { api } from '@/lib/api'
import { githubUrl } from '@/lib/github'
import { move, useDragList } from '@/lib/use-drag-list'
import { cn } from '@/lib/utils'
import { CollectionFields, DATA_FILE_ICON, DataFileInput, groupOptions, groupToSave, IconPicker, type CollectionDraft } from './CollectionFields'
import { FolderInput } from './FolderInput'

type SiteSettings = Pick<ResolvedConfig, 'adapter' | 'content_dir' | 'media_dir' | 'public_media_path'> & { site_url: string }

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
          <dt className="text-muted-foreground">Repository</dt>
          <dd>
            {me?.repo && (
              <a
                href={githubUrl(me.repo, 'tree')}
                target="_blank"
                rel="noreferrer"
                title="Open on GitHub"
                className="inline-flex items-center gap-1 hover:underline"
              >
                {me.repo.owner}/{me.repo.name} <ExternalLink className="size-3.5 text-muted-foreground" />
              </a>
            )}
          </dd>
          <dt className="text-muted-foreground">Branch</dt><dd>{me?.repo?.branch}</dd>
        </dl>
        <Button variant="outline" size="sm" onClick={disconnect}>Disconnect repository</Button>
      </section>

      <ConfigNotice />
      {config && <SiteSection config={config} onSaved={refetch} />}
      {config && <CollectionsSection config={config} onChanged={refetch} />}
      {config && <DataFilesSection config={config} onChanged={refetch} />}
    </div>
  )
}

function SiteSection({ config, onSaved }: { config: ResolvedConfig; onSaved: () => void }) {
  const { me } = useSession()
  const initial: SiteSettings = {
    adapter: config.adapter,
    content_dir: config.content_dir,
    media_dir: config.media_dir,
    public_media_path: config.public_media_path,
    site_url: config.site_url ?? '',
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

      <div className="space-y-1.5">
        <Label htmlFor="site_url">Website address</Label>
        <div className="flex items-center gap-2">
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <Input
            id="site_url"
            type="url"
            placeholder="https://example.com"
            value={draft.site_url}
            onChange={(e) => set({ site_url: e.target.value })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Where the built site is published. Set it and each entry gets a link to its live page.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Saved to{' '}
        {me?.repo ? (
          <a href={githubUrl(me.repo, 'blob', CONFIG_PATH)} target="_blank" rel="noreferrer" title="Open on GitHub" className="inline-flex items-center gap-0.5 hover:underline">
            <code>{CONFIG_PATH}</code> <ExternalLink className="size-3" />
          </a>
        ) : (
          <code>{CONFIG_PATH}</code>
        )}{' '}
        in the repository.
      </p>
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

const NEW_COLLECTION: CollectionDraft = { name: '', label: '', path: '', group: '' }

function CollectionsSection({ config, onChanged }: { config: ResolvedConfig; onChanged: () => void }) {
  const [adding, setAdding] = useState<CollectionDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()
  const navigate = useNavigate()
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

  async function add() {
    if (!adding) return
    setBusy(true)
    setError(null)
    try {
      const { path, group, ...rest } = adding
      await api('/config/collections', { method: 'POST', json: { ...rest, folder: path, group: groupToSave(group, 'collection') } })
      setAdding(null)
      onChanged()
      // Straight on to its page, where its parameters are set up.
      navigate(`/settings/collections/${adding.name}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Collections</h2>
          <p className="text-xs text-muted-foreground">Open one to change its settings and parameters. Drag to set the sidebar order.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setError(null); setAdding(NEW_COLLECTION) }}><Plus /> Add collection</Button>
      </div>

      <ul className="divide-y rounded-md border">
        {collections.map((col, i) => (
          <li
            key={col.name}
            {...drag.rowProps(i)}
            className={cn(
              // No dimming of the source row: the browser already draws a
              // translucent copy under the cursor, and both at once reads as a glitch.
              'flex items-center gap-2 bg-background px-3 py-2 text-sm',
              drag.over === i && drag.from !== i && 'relative z-10 ring-2 ring-ring',
            )}
          >
            <span {...drag.handleProps} className="cursor-grab text-muted-foreground" aria-hidden><GripVertical className="size-4" /></span>
            <Link to={`/settings/collections/${col.name}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1 hover:bg-accent/50">
              <CollectionIcon name={col.icon} className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{col.label}</div>
                <div className="truncate text-xs text-muted-foreground">
                  <code>{col.folder}</code>{col.group?.trim() && ` · ${col.group}`}
                </div>
              </div>
              <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <SlidersHorizontal className="size-3.5" /> {col.fields.length} parameter{col.fields.length === 1 ? '' : 's'}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
            <Button variant="ghost" size="icon" aria-label={`Remove ${col.label}`} onClick={() => remove(col)}><Trash2 /></Button>
          </li>
        ))}
      </ul>

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent
          // Name, group, icons and folder outgrow a short laptop screen; scroll rather than cut off the button.
          className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto"
          onOpenAutoFocus={(e) => {
            // Radix picks its own target; the name field is the one to start in.
            e.preventDefault()
            firstField.current?.focus()
          }}
        >
          <DialogTitle>Add a collection</DialogTitle>
          {adding && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                add()
              }}
            >
              <CollectionFields
                kind="collection"
                draft={adding}
                isNew
                contentDir={config.content_dir}
                groups={groupOptions(config, 'collection')}
                nameRef={firstField}
                onChange={(patch) => setAdding((d) => (d ? { ...d, ...patch } : d))}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdding(null)}>Cancel</Button>
                <Button type="submit" disabled={busy || !adding.label.trim() || !adding.path.trim()}>
                  {busy ? 'Adding…' : 'Add collection'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** YAML, JSON or TOML files edited like collections: data/platforms.yaml and the like. */
function DataFilesSection({ config, onChanged }: { config: ResolvedConfig; onChanged: () => void }) {
  const [adding, setAdding] = useState<{ file: string; label: string; icon?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()
  const navigate = useNavigate()
  const taken = config.data.map((d) => d.file)
  // platforms.yaml becomes "Platforms", keyed platforms; a clash with an existing name gets a number.
  const base = (file: string) => file.split('/').pop()!.replace(/\.[^.]+$/, '')
  const nameFor = (file: string) => {
    const root = slugify(base(file)) || 'data'
    let name = root
    for (let n = 2; config.data.some((d) => d.name === name); n++) name = `${root}-${n}`
    return name
  }

  async function remove(name: string, label: string, file: string) {
    const ok = await confirm({
      title: `Remove "${label}" from the CMS?`,
      body: `${file} stays in your repository as it is; only its entry in the configuration is removed.`,
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    try {
      await api(`/config/data/${name}`, { method: 'DELETE' })
      onChanged()
    } catch (e) {
      await confirm({ title: 'Could not remove the data file', body: (e as Error).message, alert: true })
    }
  }

  async function add() {
    if (!adding) return
    setBusy(true)
    setError(null)
    const file = adding.file.trim()
    const name = nameFor(file)
    try {
      await api('/config/data', { method: 'POST', json: { name, label: adding.label.trim() || labelFor(base(file)), file, icon: adding.icon } })
      setAdding(null)
      onChanged()
      // Straight to the entries, which is what adding one was for.
      navigate(`/data/${name}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Data files</h2>
          <p className="text-xs text-muted-foreground">Registries like platforms or pricing, kept as YAML, JSON or TOML in any folder.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setError(null); setAdding({ file: '', label: '' }) }}><Plus /> Add data file</Button>
      </div>

      {config.data.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {config.data.map((d) => (
            <li key={d.name} className="flex items-center gap-2 bg-background px-3 py-2 text-sm">
              <Link to={`/settings/data/${d.name}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1 hover:bg-accent/50">
                <CollectionIcon name={d.icon ?? DATA_FILE_ICON} className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.label}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    <code>{d.file}</code>{d.group?.trim() && ` · ${d.group}`}
                  </div>
                </div>
                <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <SlidersHorizontal className="size-3.5" /> {d.fields.length} parameter{d.fields.length === 1 ? '' : 's'}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
              <Button variant="ghost" size="icon" aria-label={`Remove ${d.label}`} onClick={() => remove(d.name, d.label, d.file)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No data files yet.</p>
      )}

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto">
          <DialogTitle>Add a data file</DialogTitle>
          {adding && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                add()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="data-file">File</Label>
                <DataFileInput
                  id="data-file"
                  value={adding.file}
                  exclude={taken}
                  onChange={(file) => setAdding((a) => a && { ...a, file, label: a.label || (file.includes('.') ? labelFor(base(file)) : '') })}
                />
                <p className="text-xs text-muted-foreground">Its parameters are worked out from the entries already in it, and can be changed afterwards.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-label">Name</Label>
                <Input id="data-label" value={adding.label} placeholder="Platforms" onChange={(e) => setAdding((a) => a && { ...a, label: e.target.value })} />
                <p className="text-xs text-muted-foreground">Shown in the sidebar.</p>
              </div>
              <IconPicker value={adding.icon} fallback={DATA_FILE_ICON} onChange={(icon) => setAdding((a) => a && { ...a, icon })} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdding(null)}>Cancel</Button>
                <Button type="submit" disabled={busy || !adding.file.trim()}>{busy ? 'Adding…' : 'Add data file'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
