import { useEffect, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router'
import { ChevronDown, ExternalLink, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { CollectionIcon } from '@/components/CollectionIcon'
import { useConfirm } from '@/components/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { Field } from '@/core/config'
import { DATA_KEY, type DataEntry } from '@/core/data-file'
import { recommendFields } from '@/core/generate-config'
import { isToml } from '@/core/options'
import { useSession } from '@/features/auth/session'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { UndescribedFieldsNotice } from '@/features/config/UndescribedFieldsNotice'
import { useConfig } from '@/features/config/use-config'
import { FieldInput, FieldRow } from '@/features/editor/registry'
import { DATA_FILE_ICON } from '@/features/settings/CollectionFields'
import { api, type ApiError } from '@/lib/api'
import { githubUrl } from '@/lib/github'
import { useFetch } from '@/lib/use-fetch'
import { cn } from '@/lib/utils'

type Loaded = { sha: string | null; entries: DataEntry[] }
/** Rows carry an id of their own, since a key can be typed, cleared or clash while it is edited. */
type Row = DataEntry & { id: number; isNew?: boolean }

let nextId = 0
const plain = (rows: Row[]): DataEntry[] => rows.map(({ key, values }) => ({ key, values }))
const labelOf = (row: DataEntry) => String(row.values.name ?? row.values.title ?? '') || row.key || 'New entry'

/** The entries of one data file, edited like content and saved to the file in one commit. */
export function DataPage() {
  const { name = '' } = useParams()
  // Keyed, so switching files from the sidebar does not carry one file's rows into the next.
  return <DataEditor key={name} name={name} />
}

function DataEditor({ name }: { name: string }) {
  const { me } = useSession()
  const { config, error: cfgError, refetch: refetchConfig } = useConfig()
  const df = config?.data.find((d) => d.name === name)
  const loaded = useFetch<Loaded>(df ? `/data/${name}` : null)

  const [rows, setRows] = useState<Row[] | null>(null)
  // Compared against what was last saved rather than the first load, so a save leaves it clean.
  const [saved, setSaved] = useState<Loaded | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entryErrors, setEntryErrors] = useState<Record<string, Record<string, string>>>({})
  // Problems are only pointed out once a save is attempted, not while an entry is still being typed.
  const [tried, setTried] = useState(false)
  const [undescribedDismissed, setUndescribedDismissed] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    if (!loaded.data) return
    setSaved(loaded.data)
    setRows(loaded.data.entries.map((e) => ({ ...e, id: nextId++ })))
  }, [loaded.data])

  const dirty = !!rows && !!saved && JSON.stringify(plain(rows)) !== JSON.stringify(saved.entries)
  const blocker = useBlocker(() => dirty)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    confirm({
      title: 'Leave without saving?',
      body: 'Your changes to these entries will be lost.',
      confirmLabel: 'Leave',
      destructive: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker, confirm])

  if (cfgError) return <div className="p-6"><ConfigNotice /></div>
  if (config && !df) return <div className="p-6 text-sm text-muted-foreground">There is no data file named “{name}” in the configuration.</div>
  if (loaded.error) return <div className="p-6 text-sm text-destructive">{loaded.error.message}</div>
  if (!df || !rows || !saved) {
    if (!loaded.showLoading) return null
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <Skeleton className="h-7 w-48" />
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}
      </div>
    )
  }

  const keys = rows.map((r) => r.key.trim())
  // Each problem names the row it is about, so the list can open and scroll to it.
  const problems = rows.flatMap((r, i) => {
    const key = keys[i]
    const message = !key
      ? `“${labelOf(r)}” needs a key`
      : !DATA_KEY.test(key)
        ? `“${r.key}” is not a valid key: use letters, numbers, hyphens or underscores`
        : keys.indexOf(key) !== i ? `The key “${key}” is used twice` : null
    return message ? [{ message, row: r.id }] : []
  })
  const goTo = (row: number) => {
    setOpen(row)
    requestAnimationFrame(() => document.getElementById(`entry-${row}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // Keys the entries use that no parameter describes: kept on save, not shown until they are added.
  // A key whose values name other entries of this file is recommended as a choice from it.
  const undescribed = recommendFields(
    rows.map((r) => Object.fromEntries(Object.entries(r.values).filter(([key]) => !df.fields.some((f) => f.id === key)))),
    [{ from: df.file, keys }],
  )

  async function addParameters(added: Field[]) {
    await api(`/config/data/${name}/fields`, { method: 'PUT', json: { fields: [...df!.fields, ...added] } })
    refetchConfig()
  }

  const setValue = (id: number, fieldId: string, value: unknown) =>
    setRows((all) =>
      all!.map((r) => {
        if (r.id !== id) return r
        const values = { ...r.values }
        if (value === undefined) delete values[fieldId]
        else values[fieldId] = value
        return { ...r, values }
      }),
    )

  async function remove(row: Row) {
    const ok = await confirm({
      title: `Remove “${labelOf(row)}”?`,
      body: 'It leaves the file when you save. Content that refers to this key will no longer find it.',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (ok) setRows((all) => all!.filter((r) => r.id !== row.id))
  }

  function add() {
    const row: Row = { key: '', values: {}, id: nextId++, isNew: true }
    setRows((all) => [...all!, row])
    setOpen(row.id)
  }

  async function save() {
    setTried(true)
    if (problems.length) return goTo(problems[0].row)
    setSaving(true)
    setError(null)
    setEntryErrors({})
    try {
      const entries = plain(rows!).map((e) => ({ ...e, key: e.key.trim() }))
      const res = await api<Loaded>(`/data/${name}`, { method: 'PUT', json: { sha: saved!.sha, entries } })
      setSaved(res)
      setTried(false)
      // The file keeps its order and appends new keys, as the list does, so rows line up by position.
      setRows(res.entries.map((e, i) => ({ ...e, id: rows![i]?.id ?? nextId++ })))
    } catch (e) {
      setError((e as Error).message)
      setEntryErrors(((e as ApiError).body as { entryErrors?: Record<string, Record<string, string>> } | undefined)?.entryErrors ?? {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <CollectionIcon name={df.icon ?? DATA_FILE_ICON} className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="truncate text-xl font-semibold">{df.label}</h1>
          <p className="text-xs text-muted-foreground">
            {me?.repo ? (
              <a href={githubUrl(me.repo, 'blob', df.file)} target="_blank" rel="noreferrer" title="Open on GitHub" className="inline-flex items-center gap-0.5 hover:underline">
                <code>{df.file}</code> <ExternalLink className="size-3" />
              </a>
            ) : (
              <code>{df.file}</code>
            )}
            {` · ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`}
            {dirty && ' · unsaved'}
          </p>
        </div>
        <div className="flex gap-2 max-sm:w-full max-sm:*:flex-1">
          <Button variant="outline" asChild>
            <Link to={`/settings/data/${name}`}><SlidersHorizontal /> Parameters</Link>
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save to repository'}</Button>
        </div>
      </div>

      {(error || (tried && problems.length > 0)) && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">{error ?? 'Fix these before saving'}</p>
          {tried && problems.length > 0 && (
            <ul className="list-disc pl-5 text-muted-foreground">
              {problems.map((p) => (
                <li key={`${p.row}-${p.message}`}>
                  <button type="button" className="text-left underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground" onClick={() => goTo(p.row)}>
                    {p.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {undescribed.length > 0 && !undescribedDismissed && (
        <UndescribedFieldsNotice
          keys={undescribed.map((r) => r.field.id)}
          lead="These entries use"
          owner={df.label}
          recommend={() => undescribed}
          onAdd={addParameters}
          onDismiss={() => setUndescribedDismissed(true)}
        />
      )}

      {isToml(df.file) && (
        <p className="text-xs text-muted-foreground">Saving writes this TOML file out again, so comments in it are not kept.</p>
      )}

      {rows.length === 0 && (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No entries yet.</p>
      )}

      <ul className="space-y-2">
        {rows.map((row) => {
          const isOpen = open === row.id
          return (
            <li key={row.id} id={`entry-${row.id}`} className="scroll-mt-4 rounded-md border bg-background">
              <div className="flex items-center gap-2 p-2">
                <button type="button" className="min-w-0 flex-1 px-1 text-left" onClick={() => setOpen(isOpen ? null : row.id)}>
                  <div className="truncate text-sm font-medium">{labelOf(row)}</div>
                  <code className="text-xs text-muted-foreground">{row.key || '—'}</code>
                </button>
                <Button variant="ghost" size="icon" aria-label={`Remove ${labelOf(row)}`} onClick={() => remove(row)}><Trash2 /></Button>
                <Button variant="ghost" size="icon" aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={() => setOpen(isOpen ? null : row.id)}>
                  <ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} />
                </Button>
              </div>
              {isOpen && (
                <div className="space-y-4 border-t p-4">
                  {/* Keys are fixed once saved: renaming one would silently break every file that uses it. */}
                  {row.isNew && (
                    <FieldRow
                      field={{ id: 'key', label: 'Key', type: 'slug', required: true, help: 'How content and templates refer to this entry, like windows or open-source.' }}
                      idPrefix={`key-${row.id}`}
                      error={tried ? problems.find((p) => p.row === row.id)?.message : undefined}
                    >
                      {(inputId) => (
                        <Input
                          id={inputId}
                          autoFocus
                          className="max-w-xs font-mono"
                          value={row.key}
                          onChange={(e) => setRows((all) => all!.map((r) => (r.id === row.id ? { ...r, key: e.target.value } : r)))}
                        />
                      )}
                    </FieldRow>
                  )}
                  {df.fields.map((f) => (
                    <FieldRow key={f.id} field={f} idPrefix={`d-${row.id}-${f.id}`} error={entryErrors[row.key.trim()]?.[f.id]}>
                      {(inputId) => <FieldInput id={inputId} field={f} value={row.values[f.id]} onChange={(v) => setValue(row.id, f.id, v)} />}
                    </FieldRow>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Button variant="outline" onClick={add}><Plus /> Add entry</Button>
    </div>
  )
}
