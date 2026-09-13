import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ChevronDown, ChevronUp, EllipsisVertical, ExternalLink, Eye, History, Pencil, Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { adapters } from '@/adapters'
import { fieldPanel, isBodyField, type Collection, type Field, type Option, type ResolvedConfig } from '@/core/config'
import { recommendFields } from '@/core/generate-config'
import type { Frontmatter } from '@/core/frontmatter'
import { isBundleIndex, slugify } from '@/core/slug'
import type { Commit, EntryDetail } from '@/core/types'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { UndescribedFieldsNotice } from '@/features/config/UndescribedFieldsNotice'
import { useSession } from '@/features/auth/session'
import { useConfig } from '@/features/config/use-config'
import { HistoryPanel } from '@/features/history/HistoryPanel'
import { api, ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { githubUrl } from '@/lib/github'
import { useEditorHeaderMode } from '@/lib/editor-header'
import { useDelayed } from '@/lib/use-delayed'
import { cn } from '@/lib/utils'
import { validateEntry } from '@/core/validate'
import { Preview } from './Preview'
import { FocusMode } from './focus-mode'
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
  const { config, refetch: refetchConfig } = useConfig()
  const { me } = useSession()
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
  const [showSlug, setShowSlug] = useState(false)
  const [headerOpen, setHeaderOpen] = useState(false)
  const [headerInView, setHeaderInView] = useState(true)
  const headerMode = useEditorHeaderMode()
  const [headerTucked, setHeaderTucked] = useState(false)
  // A ref callback, since the header only mounts once the entry has loaded. On a phone the page
  // scrolls in the app's <main>; its direction decides whether an auto-hiding header tucks away.
  const watchHeader = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setHeaderInView(entry.isIntersecting))
    observer.observe(el)
    const scroller = el.closest('main')
    let last = scroller?.scrollTop ?? 0
    const onScroll = () => {
      const top = scroller!.scrollTop
      if (Math.abs(top - last) < 8) return
      setHeaderTucked(top > last && top > el.offsetHeight)
      last = top
    }
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      scroller?.removeEventListener('scroll', onScroll)
    }
  }, [])
  const [loading, setLoading] = useState(!isNew)
  const showSkeleton = useDelayed(loading)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [panel, setPanel] = useState<'none' | 'history' | 'preview'>('none')
  // The Markdown field being written in focus mode, with everything else out of the way.
  const [focusField, setFocusField] = useState<string | null>(null)
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

  // Frontmatter keys the collection has no parameter for are still saved, but not shown; offer to
  // turn them into parameters, typed from how the collection's entries use them.
  const [undescribedDismissed, setUndescribedDismissed] = useState(false)
  const undescribed = isNew
    ? []
    : recommendFields([Object.fromEntries(Object.entries(data).filter(([key]) => !fields.some((f) => f.id === key)))])

  async function recommendParameters() {
    const keys = undescribed.map((r) => r.field.id).join(',')
    // Values that are all keys of a data file (a post's categories, say) are recommended as a choice from it.
    const sources = Promise.all(
      (config?.data ?? []).map((d) =>
        api<{ options: Option[] }>(`/options?from=${encodeURIComponent(d.file)}`)
          .then(({ options }) => ({ from: d.file, label: d.label, keys: options.map((o) => o.value) }))
          .catch(() => ({ from: d.file, keys: [] })), // an unreadable file just suggests nothing
      ),
    )
    try {
      const [{ samples }, known] = await Promise.all([
        api<{ samples: Frontmatter[] }>(`/samples/${col.name}?keys=${encodeURIComponent(keys)}`),
        sources,
      ])
      const found = new Map(recommendFields(samples, known).map((r) => [r.field.id, r]))
      return undescribed.map((r) => found.get(r.field.id) ?? r)
    } catch {
      return undescribed // this entry's own values still say something
    }
  }

  async function addParameters(added: Field[]) {
    // New parameters go before the body, which stays last.
    const next = [...fields.filter((f) => !isBodyField(f)), ...added, ...fields.filter(isBodyField)]
    await api(`/config/collections/${col.name}/fields`, { method: 'PUT', json: { fields: next } })
    refetchConfig()
  }

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

  function validate(d: Frontmatter) {
    const errs = validateEntry(fields, d, body)
    if (!slug.trim()) errs.slug = 'Required'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function save(overrides: Frontmatter = {}, force = false) {
    const merged = { ...data, ...overrides }
    if (!validate(merged)) return
    // Write keys in the order the config declares them. Keys no parameter describes are not shown,
    // but they are still written back, after the others, so saving never drops them.
    const d: Frontmatter = {}
    for (const f of fields) if (!isBodyField(f) && f.id in merged) d[f.id] = merged[f.id]
    for (const k of Object.keys(merged)) if (!(k in d)) d[k] = merged[k]
    setSaving(true); setError(null)
    try {
      let sha = entry?.sha
      if (force) sha = (await api<EntryDetail>(entryUrl(entry!.slug, undefined, entry?.path))).sha
      const res = isNew
        ? await api<EntryDetail>(`/entries/${col.name}`, { method: 'POST', json: { slug, data: d, body } })
        : await api<EntryDetail>(entryUrl(entry!.slug), {
            method: 'PUT',
            // A different slug renames the file on the server.
            json: { data: d, body, sha, path: entry?.path, rename: slug !== entry!.slug ? slug : undefined },
          })
      setEntry(res); setData(res.data); setDirty(false); setConflict(false)
      if (isNew || res.slug !== entry?.slug) navigate(`/content/${col.name}/edit/${res.slug}`, { replace: true, state: { path: res.path } })
    } catch (e) {
      const errs = (e as ApiError).body as { fieldErrors?: Record<string, string> } | undefined
      if (e instanceof ApiError && e.status === 409) setConflict(true)
      else if (errs?.fieldErrors) setFieldErrors(errs.fieldErrors)
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
      await api(entryUrl(entry.slug), { method: 'DELETE', json: { sha: entry.sha, title, path: entry.path } })
      setDirty(false)
      navigate(`/content/${col.name}`)
    } catch (e) {
      setError((e as Error).message); setSaving(false)
    }
  }

  async function viewVersion(c: Commit | null) {
    if (!c) return setVersion(null)
    const v = await api<EntryDetail>(entryUrl(entry!.slug, c.sha, entry?.path))
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

  const focusOn = (f: Field) => ({ focused: focusField === f.id, toggle: () => setFocusField((id) => (id === f.id ? null : f.id)) })
  const focused = fields.find((f) => f.id === focusField)
  // In focus mode the other fields are hidden rather than unmounted, so nothing typed or undoable is lost either way.
  const renderField = (f: Field) => (
    <FieldRow key={f.id} field={f} idPrefix={`f-${f.id}`} error={fieldErrors[f.id]} hidden={!!focused && focused !== f} bare={focused === f}>
      {(inputId) => (
        <FocusMode.Provider value={focusOn(f)}>
          <FieldInput id={inputId} field={f} value={isBodyField(f) ? shown.body : shown.data[f.id]} onChange={(v) => setField(f, v)} />
        </FocusMode.Provider>
      )}
    </FieldRow>
  )

  const togglePanel = (name: 'history' | 'preview') => setPanel((p) => (p === name ? 'none' : name))
  // Save and publish stay in view; everything else waits behind one menu. Drawn inline on wide screens
  // and as an even row on phones.
  const actions: { key: string; label: string; variant: 'outline' | 'default'; onClick: () => void; disabled?: boolean }[] = [
    { key: 'save', label: saving ? 'Saving…' : 'Save', variant: 'outline', onClick: () => save(), disabled: saving || !!version },
    ...(hasDraft
      ? [{ key: 'publish', label: status === 'draft' ? 'Publish' : 'Unpublish', variant: 'default' as const, onClick: () => save({ draft: status !== 'draft' }), disabled: saving || !!version }]
      : []),
  ]
  const renderMore = (variant: 'ghost' | 'outline', className?: string) => (
    <DropdownMenu key="more">
      <DropdownMenuTrigger asChild>
        <Button variant={panel !== 'none' ? 'secondary' : variant} size="sm" className={className}>
          <EllipsisVertical /> More
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => togglePanel('preview')}><Eye /> {panel === 'preview' ? 'Hide preview' : 'Preview'}</DropdownMenuItem>
        {!isNew && (
          <DropdownMenuItem onSelect={() => togglePanel('history')}><History /> {panel === 'history' ? 'Hide history' : 'History'}</DropdownMenuItem>
        )}
        {liveUrl && (
          <DropdownMenuItem asChild>
            <a href={liveUrl} target="_blank" rel="noreferrer"><ExternalLink /> View on site</a>
          </DropdownMenuItem>
        )}
        {!isNew && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={saving} onSelect={remove}><Trash2 /> Delete</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const renderAction = (a: (typeof actions)[number], variant = a.variant, className?: string) => (
    <Button key={a.key} variant={variant} size="sm" className={className} onClick={a.onClick} disabled={a.disabled}>
      {a.label}
      {/* On a phone the status line is often folded away, so Save carries a dot while there is something to save. */}
      {a.key === 'save' && dirty && <span className="size-1.5 rounded-full bg-amber-500 sm:hidden" aria-hidden />}
    </Button>
  )

  return (
    // On phones the whole editor scrolls as one page, so the header scrolls away and leaves the screen to the form.
    // Focus mode lifts the page over the app's bar and sidebar, keeping only the header and the field.
    <div className={cn('flex h-full flex-col max-sm:h-auto', focused && 'fixed inset-0 z-40 bg-background max-sm:h-full max-sm:overflow-y-auto')}>
      <div
        ref={watchHeader}
        className={cn(
          'flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2',
          headerMode === 'autohide' && 'max-sm:sticky max-sm:top-0 max-sm:z-20 max-sm:transition-transform max-sm:duration-200',
          headerMode === 'autohide' && headerTucked && !focused && 'max-sm:-translate-y-full',
          focused && 'sticky top-0 z-20',
        )}
      >
        {/* In focus mode, back means back to the whole form, not out of the entry. */}
        {focused ? (
          <Button variant="ghost" size="icon" aria-label="Back to all fields" title="Back to all fields" onClick={() => setFocusField(null)}>
            <ArrowLeft />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" asChild aria-label="Back">
            <Link to={`/content/${col.name}`}><ArrowLeft /></Link>
          </Button>
        )}
        {/* The basis makes the actions wrap under the title on narrow screens instead of squeezing it. */}
        <div className="min-w-0 flex-1 basis-40 sm:basis-56">
          <div className="truncate font-medium">{title}</div>
          {/* One line: only the file path gives way, with an ellipsis, when space runs out. */}
          <div className={cn('flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground', !headerOpen && 'max-sm:hidden')}>
            <span className="shrink-0">{col.label}</span>
            {/* A new entry's file follows its title; the slug field opens from here when it needs changing. */}
            {isNew && (
              <>
                <span aria-hidden>·</span>
                <code className="min-w-0 truncate" title={`${col.folder}/${slug || '…'}.${col.extension}`}>
                  {col.folder}/{slug || '…'}.{col.extension}
                </code>
                {!showSlug && !fieldErrors.slug && (
                  <Button type="button" variant="ghost" size="icon" className="-my-1 size-6 shrink-0" aria-label="Edit slug" title="Edit slug" onClick={() => setShowSlug(true)}>
                    <Pencil className="size-3" />
                  </Button>
                )}
              </>
            )}
            {/* A saved entry keeps its file; the path opens it on GitHub. */}
            {!isNew && entry && (
              <>
                <span aria-hidden>·</span>
                {me?.repo ? (
                  <a href={githubUrl(me.repo, 'blob', entry.path)} target="_blank" rel="noreferrer" title={`${entry.path} on GitHub`} className="flex min-w-0 items-center gap-0.5 hover:text-foreground hover:underline">
                    <code className="min-w-0 truncate">{entry.path}</code>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ) : (
                  <code className="min-w-0 truncate" title={entry.path}>{entry.path}</code>
                )}
                {/* A page bundle's folder holds its images too, so it keeps its slug. */}
                {!isBundleIndex(entry.path) && !showSlug && !fieldErrors.slug && (
                  <Button type="button" variant="ghost" size="icon" className="-my-1 size-6 shrink-0" aria-label="Edit slug" title="Edit slug" onClick={() => setShowSlug(true)}>
                    <Pencil className="size-3" />
                  </Button>
                )}
              </>
            )}
            {status && (
              <>
                <span aria-hidden>·</span>
                <Badge variant={status === 'draft' ? 'warning' : 'success'} className="shrink-0">{status}</Badge>
              </>
            )}
            {dirty && (
              <>
                <span aria-hidden>·</span>
                <span className="shrink-0">unsaved</span>
              </>
            )}
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          {renderMore('ghost')}
          {actions.map((a) => renderAction(a))}
        </div>
        {/* Phones: Save beside the title while folded; the toggle opens every action in an even row. */}
        {!headerOpen && <div className="sm:hidden">{renderAction(actions.find((a) => a.key === 'save')!)}</div>}
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-expanded={headerOpen}
          aria-label={headerOpen ? 'Hide details and actions' : 'Show details and actions'}
          onClick={() => setHeaderOpen((open) => !open)}
        >
          <ChevronDown className={cn('transition-transform', headerOpen && 'rotate-180')} />
        </Button>
        {headerOpen && (
          <div className="grid w-full auto-cols-fr grid-flow-col gap-2 sm:hidden">
            {renderMore('outline', 'w-full')}
            {actions.map((a) => renderAction(a, 'outline', 'w-full'))}
          </div>
        )}
      </div>

      {/* Once the header has scrolled off a phone's screen, Save follows along in the corner. */}
      {!headerInView && !focused && (
        <Button className="fixed right-4 bottom-4 z-30 shadow-lg sm:hidden" onClick={() => save()} disabled={saving || !!version}>
          {saving ? 'Saving…' : 'Save'}
          {dirty && <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />}
        </Button>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-w-0 flex-1 overflow-y-auto max-sm:overflow-visible">
          <div className={cn('mx-auto space-y-6 p-6', focused ? 'max-w-4xl' : 'max-w-6xl')}>
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
            {undescribed.length > 0 && !undescribedDismissed && !version && !focused && (
              <UndescribedFieldsNotice
                keys={undescribed.map((r) => r.field.id)}
                lead="This entry has"
                owner={col.label}
                recommend={recommendParameters}
                onAdd={addParameters}
                onDismiss={() => setUndescribedDismissed(true)}
              />
            )}

            <fieldset disabled={!!version || saving} className="space-y-6">
              {/* The slug follows the title, so it stays tucked away unless asked for or missing on save. */}
              {!focused && (showSlug || fieldErrors.slug) && (
                <FieldRow
                  field={{
                    id: 'slug',
                    label: 'Slug',
                    type: 'text',
                    required: true,
                    help: isNew || slug === entry?.slug
                      ? `${col.folder}/${slug || '…'}.${col.extension}`
                      : `Saving renames the file to ${col.folder}/${slug || '…'}.${col.extension}, and the page’s address on the site changes with it.`,
                  }}
                  idPrefix="slug"
                  error={fieldErrors.slug}
                >
                  {(inputId) => (
                    <div className="flex max-w-md items-center gap-2">
                      <Input id={inputId} autoFocus={showSlug} value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); setDirty(true) }} className="font-mono" />
                      {/* While the slug is the reason a save failed, it stays in view. */}
                      {!fieldErrors.slug && (
                        // For a saved entry, closing the field also keeps the slug it has.
                        <Button type="button" variant="ghost" size="sm" onClick={() => { if (entry) setSlug(entry.slug); setShowSlug(false) }}>
                          <ChevronUp /> {isNew ? 'Hide' : 'Cancel'}
                        </Button>
                      )}
                    </div>
                  )}
                </FieldRow>
              )}
              <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
                <div className="min-w-0 flex-1 space-y-6">
                  {mainFields.map(renderField)}
                </div>
                {sidebarFields.length > 0 && (
                  <aside hidden={!!focused && !sidebarFields.includes(focused)} className="w-full shrink-0 space-y-6 rounded-md border p-4 xl:sticky xl:top-6 xl:w-72">
                    {sidebarFields.map(renderField)}
                  </aside>
                )}
              </div>
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

