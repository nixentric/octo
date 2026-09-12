import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Eye, History, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Collection, Field } from '@/core/config'
import type { Frontmatter } from '@/core/frontmatter'
import { slugify } from '@/core/slug'
import type { Commit, EntryDetail } from '@/core/types'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { useConfig } from '@/features/config/use-config'
import { HistoryPanel } from '@/features/history/HistoryPanel'
import { api, ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Preview } from './Preview'
import { isEmpty, widgets } from './widgets'

type Version = { commit: Commit; data: Frontmatter; body: string }

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
    if (f.name === 'body') continue
    if (f.default !== undefined) d[f.name] = f.default
    else if (f.type === 'datetime') d[f.name] = new Date().toISOString()
  }
  return d
}

function Editor({ col, slugParam }: { col: Collection; slugParam?: string }) {
  const isNew = !slugParam
  const navigate = useNavigate()
  const fields = col.fields
  const hasDraft = fields.some((f) => f.name === 'draft' && f.type === 'boolean')

  const [entry, setEntry] = useState<EntryDetail | null>(null)
  const [data, setData] = useState<Frontmatter>(() => (isNew ? defaults(fields) : {}))
  const [body, setBody] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [panel, setPanel] = useState<'none' | 'history' | 'preview'>('none')
  const [version, setVersion] = useState<Version | null>(null)
  const dirtyRef = useRef(false)
  const [dirty, setDirtyState] = useState(false)
  const setDirty = (v: boolean) => { dirtyRef.current = v; setDirtyState(v) }

  const entryUrl = (s: string, ref?: string) => `/entries/${col.name}/${s}${ref ? `?ref=${ref}` : ''}`

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const e = await api<EntryDetail>(entryUrl(slugParam!))
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
    if (confirm('You have unsaved changes. Leave without saving?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  const shown = version ?? { data, body }
  const title = String(shown.data.title ?? '') || slug || `New ${col.label}`

  function setField(f: Field, v: unknown) {
    if (f.name === 'body') setBody(String(v ?? ''))
    else {
      setData((d) => {
        const n = { ...d }
        if (v === undefined) delete n[f.name]
        else n[f.name] = v
        return n
      })
      if (isNew && f.name === 'title' && !slugTouched) setSlug(slugify(String(v ?? '')))
    }
    setFieldErrors((e) => { const { [f.name]: _, ...rest } = e; return rest })
    setDirty(true)
  }

  function validate(d: Frontmatter) {
    const errs: Record<string, string> = {}
    for (const f of fields) {
      const v = f.name === 'body' ? body : d[f.name]
      if (f.required && isEmpty(v)) errs[f.name] = 'Required'
    }
    if (isNew && !slug) errs.slug = 'Required'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function save(overrides: Frontmatter = {}, force = false) {
    const d = { ...data, ...overrides }
    if (!validate(d)) return
    setSaving(true); setError(null)
    try {
      let sha = entry?.sha
      if (force) sha = (await api<EntryDetail>(entryUrl(slug))).sha
      const res = isNew
        ? await api<EntryDetail>(`/entries/${col.name}`, { method: 'POST', json: { slug, data: d, body } })
        : await api<EntryDetail>(entryUrl(slug), { method: 'PUT', json: { data: d, body, sha } })
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
    if (!entry || !confirm(`Delete "${title}"? This commits the deletion to the repository.`)) return
    setSaving(true)
    try {
      await api(entryUrl(slug), { method: 'DELETE', json: { sha: entry.sha, title } })
      setDirty(false)
      navigate(`/content/${col.name}`)
    } catch (e) {
      setError((e as Error).message); setSaving(false)
    }
  }

  async function viewVersion(c: Commit | null) {
    if (!c) return setVersion(null)
    const v = await api<EntryDetail>(entryUrl(slug, c.sha))
    setVersion({ commit: c, data: v.data, body: v.body })
  }

  function restore() {
    if (!version) return
    setData(version.data); setBody(version.body); setVersion(null); setDirty(true)
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  if (error && !entry && !isNew) return <div className="p-6 text-sm text-destructive">{error}</div>

  const status = hasDraft ? (data.draft === true ? 'draft' : 'published') : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <Button variant="ghost" size="icon" asChild aria-label="Back">
          <Link to={`/content/${col.name}`}><ArrowLeft /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">
            {col.label}{status && <> · <Badge variant={status === 'draft' ? 'outline' : 'secondary'} className="ml-1">{status}</Badge></>}{dirty && ' · unsaved'}
          </div>
        </div>
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
          <div className="mx-auto max-w-3xl space-y-6 p-6">
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
                <FieldRow id="slug" label="Slug" hint={`${col.folder}/${slug || '…'}.${col.extension}`} error={fieldErrors.slug} required>
                  <Input id="slug" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); setDirty(true) }} className="max-w-md font-mono" />
                </FieldRow>
              )}
              {fields.map((f) => {
                const W = widgets[f.type]
                const value = f.name === 'body' ? shown.body : shown.data[f.name]
                return (
                  <FieldRow key={f.name} id={`f-${f.name}`} label={f.label ?? f.name} hint={f.hint} error={fieldErrors[f.name]} required={f.required} inline={f.type === 'boolean'}>
                    <W id={`f-${f.name}`} field={f} value={value} onChange={(v) => setField(f, v)} />
                  </FieldRow>
                )
              })}
            </fieldset>
          </div>
        </div>

        {panel !== 'none' && (
          <aside className={cn('shrink-0 border-t lg:w-[26rem] lg:border-l lg:border-t-0', panel === 'preview' ? 'h-[60vh] lg:h-auto lg:w-[32rem]' : 'max-h-[40vh] overflow-y-auto lg:max-h-none')}>
            {panel === 'history' && <HistoryPanel path={entry!.path} activeSha={version?.commit.sha} onSelect={viewVersion} />}
            {panel === 'preview' && <Preview fields={fields} data={shown.data} body={shown.body} />}
          </aside>
        )}
      </div>
    </div>
  )
}

function FieldRow({ id, label, hint, error, required, inline, children }: {
  id: string; label: string; hint?: string; error?: string; required?: boolean; inline?: boolean; children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', inline && 'flex items-center gap-3 space-y-0')}>
      <Label htmlFor={id} className={cn(inline && 'order-2')}>
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
