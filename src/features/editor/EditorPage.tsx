import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import YAML from 'yaml'
import { ArrowLeft, ExternalLink, Eye, History, Trash2, X } from 'lucide-react'
import { useConfirm } from '@/components/confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { adapters } from '@/adapters'
import { fieldPanel, isBodyField, type Collection, type Field, type ResolvedConfig } from '@/core/config'
import type { Frontmatter } from '@/core/frontmatter'
import { slugify } from '@/core/slug'
import type { Commit, EntryDetail } from '@/core/types'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { useConfig } from '@/features/config/use-config'
import { HistoryPanel } from '@/features/history/HistoryPanel'
import { api, ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useDelayed } from '@/lib/use-delayed'
import { cn } from '@/lib/utils'
import { validateEntry } from '@/core/validate'
import { Preview } from './Preview'
import { FieldInput, FieldRow } from './registry'

type Version = { commit: Commit; data: Frontmatter; body: string }

const adapterPermalink = (config: ResolvedConfig, col: Collection, slug: string, data: Frontmatter) =>
  adapters[config.adapter].permalink(config.content_dir, col.folder, slug, data)

export function EditorPage() {
  const { collection = '', '*': slugParam } = useParams()
  const { config, error: cfgError } = useConfig()
  const col = config?.collections.find((c) => c.name === collection)
  if (cfgError) return <div className="p-6"><ConfigNotice /></div>
  if (!config) return null
  if (!col) return <div className="p-6 text-sm text-muted-foreground">Unknown collection.</div>
  return <Editor key={`${collection}/${slugParam ?? ''}`} col={col} slugParam={slugParam || undefined} />
}

function defaults(fields: Field[]): Frontmatter {
  const d: Frontmatter = {}
  for (const f of fields) {
    if (isBodyField(f)) continue
    if (f.default !== undefined) d[f.id] = f.default
    else if (f.type === 'datetime' || f.type === 'date') d[f.id] = new Date().toISOString()
  }
  return d
}

function Editor({ col, slugParam }: { col: Collection; slugParam?: string }) {
  const { config } = useConfig()
  const isNew = !slugParam
  const navigate = useNavigate()
  const confirm = useConfirm()
  // Arriving from the list saves the worker a lookup for bundle entries.
  const knownPath = (useLocation().state as { path?: string } | null)?.path
  const fields = col.fields
  const hasDraft = fields.some((f) => f.id === 'draft' && f.type === 'boolean')

  const [entry, setEntry] = useState<EntryDetail | null>(null)
  const [data, setData] = useState<Frontmatter>(() => (isNew ? defaults(fields) : {}))
  const [body, setBody] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const showSkeleton = useDelayed(loading)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [panel, setPanel] = useState<'none' | 'history' | 'preview'>('none')
  const [version, setVersion] = useState<Version | null>(null)
  const dirtyRef = useRef(false)
  const [dirty, setDirtyState] = useState(false)
  const setDirty = (v: boolean) => { dirtyRef.current = v; setDirtyState(v) }

  const entryUrl = (s: string, ref?: string, path?: string) => {
    const q = new URLSearchParams()
    if (ref) q.set('ref', ref)
    if (path) q.set('path', path)
    return `/entries/${col.name}/${s}${q.size ? `?${q}` : ''}`
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const e = await api<EntryDetail>(entryUrl(slugParam!, undefined, knownPath))
      setEntry(e); setData(e.data); setBody(e.body); setSlug(e.slug)
      setDirty(false); setConflict(false); setVersion(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (!isNew) load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const blocker = useBlocker(() => dirtyRef.current)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    confirm({
      title: 'Leave without saving?',
      body: 'Your unsaved changes to this entry will be lost.',
      confirmLabel: 'Leave',
      destructive: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker, confirm])
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  const shown = version ?? { data, body }
  const title = String(shown.data.title ?? '') || slug || `New ${col.label}`

  function setField(f: Field, v: unknown) {
    if (isBodyField(f)) setBody(String(v ?? ''))
    else {
      setData((d) => {
        const n = { ...d }
        if (v === undefined) delete n[f.id]
        else n[f.id] = v
        return n
      })
      if (isNew && f.id === 'title' && !slugTouched) setSlug(slugify(String(v ?? '')))
    }
    setFieldErrors((e) => { const { [f.id]: _, ...rest } = e; return rest })
    setDirty(true)
  }

  function setCustom(name: string, v: unknown) {
    setData((d) => {
      const n = { ...d }
      if (v === undefined) delete n[name]
      else n[name] = v
      return n
    })
    setDirty(true)
  }

  function validate(d: Frontmatter) {
    const errs = validateEntry(fields, d, body)
    if (isNew && !slug) errs.slug = 'Required'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function save(overrides: Frontmatter = {}, force = false) {
    const merged = { ...data, ...overrides }
    if (!validate(merged)) return
    // Write keys in the order the config declares them; unknown keys keep their place at the end.
    const d: Frontmatter = {}
    for (const f of fields) if (!isBodyField(f) && f.id in merged) d[f.id] = merged[f.id]
    for (const k of Object.keys(merged)) if (!(k in d)) d[k] = merged[k]
    setSaving(true); setError(null)
    try {
      let sha = entry?.sha
      if (force) sha = (await api<EntryDetail>(entryUrl(slug, undefined, entry?.path))).sha
      const res = isNew
        ? await api<EntryDetail>(`/entries/${col.name}`, { method: 'POST', json: { slug, data: d, body } })
        : await api<EntryDetail>(entryUrl(slug), { method: 'PUT', json: { data: d, body, sha, path: entry?.path } })
      setEntry(res); setData(res.data); setDirty(false); setConflict(false)
      if (isNew) navigate(`/content/${col.name}/edit/${res.slug}`, { replace: true })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true)
      else setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!entry) return
    const ok = await confirm({
      title: `Delete "${title}"?`,
      body: 'This commits the deletion to the repository.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setSaving(true)
    try {
      await api(entryUrl(slug), { method: 'DELETE', json: { sha: entry.sha, title, path: entry.path } })
      setDirty(false)
      navigate(`/content/${col.name}`)
    } catch (e) {
      setError((e as Error).message); setSaving(false)
    }
  }

  async function viewVersion(c: Commit | null) {
    if (!c) return setVersion(null)
    const v = await api<EntryDetail>(entryUrl(slug, c.sha, entry?.path))
    setVersion({ commit: c, data: v.data, body: v.body })
  }

  function restore() {
    if (!version) return
    setData(version.data); setBody(version.body); setVersion(null); setDirty(true)
  }

  if (loading) return showSkeleton ? <EditorSkeleton /> : null
  if (error && !entry && !isNew) return <div className="p-6 text-sm text-destructive">{error}</div>

  const status = hasDraft ? (data.draft === true ? 'draft' : 'published') : null
  const liveUrl =
    config?.site_url && !isNew
      ? new URL(adapterPermalink(config, col, slug, data), config.site_url).toString()
      : null
  const mainFields = fields.filter((f) => fieldPanel(f) === 'main')
  const sidebarFields = fields.filter((f) => fieldPanel(f) === 'sidebar')

  const renderField = (f: Field) => (
    <FieldRow key={f.id} field={f} idPrefix={`f-${f.id}`} error={fieldErrors[f.id]}>
      {(inputId) => (
        <FieldInput id={inputId} field={f} value={isBodyField(f) ? shown.body : shown.data[f.id]} onChange={(v) => setField(f, v)} />
      )}
    </FieldRow>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <Button variant="ghost" size="icon" asChild aria-label="Back">
          <Link to={`/content/${col.name}`}><ArrowLeft /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">
            {col.label}{status && <> · <Badge variant={status === 'draft' ? 'warning' : 'success'} className="ml-1">{status}</Badge></>}{dirty && ' · unsaved'}
          </div>
        </div>
        {!isNew && liveUrl && (
          <Button variant="ghost" size="sm" asChild title="Open the published page">
            <a href={liveUrl} target="_blank" rel="noreferrer"><ExternalLink /> View</a>
          </Button>
        )}
        {!isNew && (
          <>
            <Button variant={panel === 'history' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPanel((p) => (p === 'history' ? 'none' : 'history'))}><History /> History</Button>
            <Button variant="ghost" size="sm" onClick={remove} disabled={saving}><Trash2 /> Delete</Button>
          </>
        )}
        <Button variant={panel === 'preview' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPanel((p) => (p === 'preview' ? 'none' : 'preview'))}><Eye /> Preview</Button>
        <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || !!version}>{saving ? 'Saving…' : 'Save'}</Button>
        {hasDraft && (
          <Button size="sm" onClick={() => save({ draft: status === 'draft' ? false : true })} disabled={saving || !!version}>
            {status === 'draft' ? 'Publish' : 'Unpublish'}
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl space-y-6 p-6">
            {conflict && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
                <p className="font-medium">This entry was changed by someone else since you opened it.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={load}>Discard my changes and reload</Button>
                  <Button size="sm" variant="outline" onClick={() => save({}, true)}>Overwrite with my version</Button>
                </div>
              </div>
            )}
            {version && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted p-3 text-sm">
                <span>Viewing version from {formatDateTime(version.commit.date)} by {version.commit.author.name}</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={restore}>Restore this version</Button>
                  <Button size="sm" variant="ghost" onClick={() => setVersion(null)}>Back to current</Button>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <fieldset disabled={!!version || saving} className="space-y-6">
              {isNew && (
                <FieldRow
                  field={{ id: 'slug', label: 'Slug', type: 'text', required: true, help: `${col.folder}/${slug || '…'}.${col.extension}` }}
                  idPrefix="slug"
                  error={fieldErrors.slug}
                >
                  {(inputId) => (
                    <Input id={inputId} value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); setDirty(true) }} className="max-w-md font-mono" />
                  )}
                </FieldRow>
              )}
              <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
                <div className="min-w-0 flex-1 space-y-6">
                  {mainFields.map(renderField)}
                </div>
                {sidebarFields.length > 0 && (
                  <aside className="w-full shrink-0 space-y-6 rounded-md border p-4 xl:sticky xl:top-6 xl:w-72">
                    {sidebarFields.map(renderField)}
                  </aside>
                )}
              </div>
              <CustomFields
                key={version?.commit.sha ?? entry?.sha ?? 'new'}
                data={shown.data}
                known={new Set(fields.map((f) => f.id))}
                onChange={setCustom}
              />
            </fieldset>
          </div>
        </div>

        {panel !== 'none' && (
          <aside className={cn('shrink-0 border-t lg:w-[26rem] lg:border-l lg:border-t-0', panel === 'preview' ? 'h-[60vh] lg:h-auto lg:w-[32rem]' : 'max-h-[40vh] overflow-y-auto lg:max-h-none')}>
            {panel === 'history' && <HistoryPanel key={entry!.sha} path={entry!.path} activeSha={version?.commit.sha} onSelect={viewVersion} />}
            {panel === 'preview' && <Preview fields={fields} data={shown.data} body={shown.body} />}
          </aside>
        )}
      </div>
    </div>
  )
}

function EditorSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Skeleton className="size-9 rounded-md" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          {[64, 96, 384].map((h, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton style={{ height: h }} />
            </div>
          ))}
        </div>
        <div className="w-full shrink-0 space-y-6 rounded-md border p-4 xl:w-72">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Frontmatter the collection does not describe. Kept on save either way; this makes it visible,
 * and only when there is some. New fields belong in the collection's parameters instead.
 */
function CustomFields({ data, known, onChange }: {
  data: Frontmatter
  known: Set<string>
  onChange: (name: string, value: unknown) => void
}) {
  const extras = Object.keys(data).filter((k) => !known.has(k))
  if (!extras.length) return null

  return (
    <section className="space-y-4 border-t pt-6">
      <div>
        <h2 className="text-sm font-medium">Other fields</h2>
        <p className="text-xs text-muted-foreground">
          Frontmatter that this collection does not describe. It is preserved whether or not you edit it here.
        </p>
      </div>

      {extras.map((name) => (
        <CustomField key={name} name={name} value={data[name]} onChange={(v) => onChange(name, v)} onRemove={() => onChange(name, undefined)} />
      ))}
    </section>
  )
}

function CustomField({ name, value, onChange, onRemove }: {
  name: string
  value: unknown
  onChange: (value: unknown) => void
  onRemove: () => void
}) {
  const structured = value != null && typeof value !== 'string'
  const [text, setText] = useState(() => (structured ? YAML.stringify(value).trimEnd() : ''))
  const [invalid, setInvalid] = useState(false)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={`x-${name}`} className="font-mono text-xs">{name}</Label>
        <Button type="button" variant="ghost" size="icon" className="size-6" onClick={onRemove} aria-label={`Remove ${name}`}>
          <X className="size-3" />
        </Button>
      </div>
      {structured ? (
        <>
          <Textarea
            id={`x-${name}`}
            rows={3}
            value={text}
            className="font-mono text-xs"
            onChange={(e) => {
              setText(e.target.value)
              try {
                onChange(YAML.parse(e.target.value))
                setInvalid(false)
              } catch {
                setInvalid(true)
              }
            }}
          />
          {invalid && <p className="text-xs text-destructive">Not valid YAML — the last valid value is kept.</p>}
        </>
      ) : (
        <Input id={`x-${name}`} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

