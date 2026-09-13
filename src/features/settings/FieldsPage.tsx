import { useEffect, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router'
import { ArrowLeft, ChevronDown, ExternalLink, GripVertical, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Combobox } from '@/components/Combobox'
import { useConfirm } from '@/components/confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  CHOICE_TYPES, CONFIG_PATH, FIELD_ID, FIELD_TYPE_LABELS, fieldPanel, MULTI_CHOICE_TYPES, NESTED_TYPES, OPTION_TYPES,
  type Field, type FieldType, type Option,
} from '@/core/config'
import { missingCoreFields, withCoreFields } from '@/core/generate-config'
import { slugify } from '@/core/slug'
import { useSession } from '@/features/auth/session'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { useConfig } from '@/features/config/use-config'
import { api, ApiError } from '@/lib/api'
import { githubUrl } from '@/lib/github'
import { useDelayed } from '@/lib/use-delayed'
import { useFetch } from '@/lib/use-fetch'
import { move, useDragList } from '@/lib/use-drag-list'
import { cn } from '@/lib/utils'
import { CollectionFields, draftOf, groupOptions, groupToSave, type CollectionDraft, type Kind } from './CollectionFields'
import { FIELD_TYPE_ICONS, FieldTypePicker } from './FieldTypePicker'

const sameDetails = (a: CollectionDraft, b: CollectionDraft, kind: Kind) =>
  a.label === b.label && a.path === b.path && a.icon === b.icon && groupToSave(a.group, kind) === groupToSave(b.group, kind) &&
  String(a.ignore) === String(b.ignore)

const idFrom = (label: string) => slugify(label).replace(/-/g, '_').replace(/^(?=\d)/, 'f_')
const isChoice = (t: FieldType) => (CHOICE_TYPES as string[]).includes(t)
const isNested = (t: FieldType) => (NESTED_TYPES as string[]).includes(t)
const isNumber = (t: FieldType) => t === 'integer' || t === 'decimal'
const isText = (t: FieldType) => ['text', 'textarea', 'markdown', 'code', 'url', 'email', 'slug'].includes(t)

type Row = { field: Field; originalId?: string }
/** Something blocking a save, and the parameter (by position) or details section it is about. */
type Problem = { message: string; field?: number; details?: boolean }

const newField = (existing: Field[]): Field => {
  let id = 'new_field'
  for (let n = 2; existing.some((f) => f.id === id); n++) id = `new_field_${n}`
  return { id, label: 'New field', type: 'text', required: false }
}

/**
 * One settings page per collection or data file: its name, group, icon and where it lives, then
 * its parameters, saved together.
 */
export function FieldsPage({ kind }: { kind: Kind }) {
  const params = useParams()
  const itemName = (kind === 'data' ? params.name : params.collection) ?? ''
  // Keyed, so moving straight from one item's page to another's starts clean instead of keeping its edits.
  return <FieldsEditor key={`${kind}:${itemName}`} kind={kind} itemName={itemName} />
}

function FieldsEditor({ kind, itemName }: { kind: Kind; itemName: string }) {
  const section = kind === 'data' ? 'data' : 'collections'
  const noun = kind === 'data' ? 'data file' : 'collection'
  const { me } = useSession()
  const { config, error: cfgError, refetch } = useConfig()
  const col = kind === 'data' ? config?.data.find((d) => d.name === itemName) : config?.collections.find((c) => c.name === itemName)

  // Rows remember the id each field had when loaded, so a rename is still
  // recognised after the list is reordered.
  const [rows, setRows] = useState<Row[] | null>(null)
  // The details are compared with what was last saved, not with the config,
  // which is still being refetched for a moment after a save.
  const [details, setDetails] = useState<CollectionDraft | null>(null)
  const [savedDetails, setSavedDetails] = useState<CollectionDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<Problem[]>([])
  // Problems are only pointed out once a save is attempted, as on the data entries page.
  const [tried, setTried] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const confirm = useConfirm()
  const showSkeleton = useDelayed(!col || !rows)

  useEffect(() => {
    if (col && rows === null) setRows(col.fields.map((f) => ({ field: f, originalId: f.id })))
    if (col && details === null) {
      setDetails(draftOf(col))
      setSavedDetails(draftOf(col))
    }
  }, [col, rows, details])

  const fields = rows?.map((r) => r.field) ?? null
  const fieldsDirty = !!col && !!fields && JSON.stringify(fields) !== JSON.stringify(col.fields)
  const detailsDirty = !!details && !!savedDetails && !sameDetails(details, savedDetails, kind)
  const dirty = fieldsDirty || detailsDirty

  const blocker = useBlocker(() => dirty)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    confirm({
      title: 'Leave without saving?',
      body: `Your changes to this ${noun} will be lost.`,
      confirmLabel: 'Leave',
      destructive: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker, confirm, noun])

  const drag = useDragList((from, to) => setRows((r) => (r ? move(r, from, to) : r)))

  if (cfgError) return <div className="p-6"><ConfigNotice /></div>
  if (!config || !col || !rows || !fields || !details) {
    if (!showSkeleton) return null
    return (
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <Skeleton className="h-7 w-56" />
        <ul className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md border p-2">
              <Skeleton className="size-4" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const localErrors: Problem[] = fields.flatMap((f, field) => {
    const problems: string[] = []
    if (!FIELD_ID.test(f.id)) problems.push(`"${f.id || '(empty)'}" is not a valid parameter ID`)
    if (!f.label.trim()) problems.push(`${f.id} needs a name`)
    if (isNested(f.type) && !f.fields?.length) problems.push(`${f.id} is a ${f.type} and needs at least one child`)
    if (OPTION_TYPES.includes(f.type) && !f.options?.length && !f.options_from?.trim()) {
      problems.push(`${f.id} needs options: list them, or read them from the repository`)
    }
    if (fields.findIndex((x) => x.id === f.id) !== field) problems.push(`Duplicate parameter ID "${f.id}"`)
    return problems.map((message) => ({ message, field }))
  })
  const blocking: Problem[] = [
    ...(details.label.trim() ? [] : [{ message: `The ${noun} needs a name`, details: true }]),
    ...(details.path.trim() ? [] : [{ message: `The ${noun} needs a ${kind === 'data' ? 'file' : 'folder'}`, details: true }]),
    ...localErrors,
  ]

  /** Opens and scrolls to what a problem is about, so the list works as a set of links. */
  const goTo = (p: Problem) => {
    if (p.field !== undefined) setOpenIndex(p.field)
    const id = p.field !== undefined ? `param-${p.field}` : 'details'
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const update = (index: number, patch: Partial<Field>) =>
    setRows((all) => all!.map((r, i) => (i === index ? { ...r, field: { ...r.field, ...patch } } : r)))

  async function remove(index: number) {
    const f = fields![index]
    const ok = await confirm({
      title: `Remove "${f.label}"?`,
      body: `Existing content keeps its "${f.id}" value in the file — the CMS just stops showing it. Templates using .Params.${f.id} keep working.`,
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (ok) setRows((all) => all!.filter((_, i) => i !== index))
  }

  async function save() {
    setTried(true)
    if (blocking.length) return goTo(blocking[0])
    setSaving(true)
    setError(null)
    setIssues([])
    try {
      // One button, but two writes when both parts changed: each re-reads the config file, so the second builds on the first.
      if (detailsDirty) {
        const d = details!
        await api(`/config/${section}/${col!.name}`, {
          method: 'PATCH',
          json: { label: d.label, [kind === 'data' ? 'file' : 'folder']: d.path, icon: d.icon, group: groupToSave(d.group, kind), ignore: d.ignore },
        })
        setSavedDetails(d)
      }
      if (fieldsDirty) {
        // Adopt what the server stored rather than clearing: the config fetch is
        // still in flight, and falling back to it would show the pre-save schema.
        const saved = await api<{ fields: Field[] }>(`/config/${section}/${col!.name}/fields`, { method: 'PUT', json: { fields } })
        setRows(saved.fields.map((f) => ({ field: f, originalId: f.id })))
      }
      setTried(false)
      refetch()
    } catch (e) {
      setError((e as Error).message)
      const body = (e as ApiError).body as { issues?: { path: (string | number)[]; message: string }[] } | undefined
      // A path starting with a number points at that parameter.
      setIssues((body?.issues ?? []).map((i) => ({
        message: `${i.path.join('.')}: ${i.message}`,
        field: typeof i.path[0] === 'number' ? i.path[0] : undefined,
      })))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" asChild aria-label="Back to settings">
          <Link to="/settings"><ArrowLeft /></Link>
        </Button>
        {/* Wide enough to read before the button moves to its own row on a phone. */}
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="truncate text-xl font-semibold">{details.label.trim() || col.label}</h1>
          <p className="text-xs text-muted-foreground">
            Saved to{' '}
            {me?.repo ? (
              <a href={githubUrl(me.repo, 'blob', CONFIG_PATH)} target="_blank" rel="noreferrer" title="Open on GitHub" className="inline-flex items-center gap-0.5 hover:underline">
                <code>{CONFIG_PATH}</code> <ExternalLink className="size-3" />
              </a>
            ) : (
              <code>{CONFIG_PATH}</code>
            )}{' '}
            in your repository{dirty && ' · unsaved'}
          </p>
        </div>
        <Button onClick={save} disabled={!dirty || saving} className="max-sm:w-full">
          {saving ? 'Saving…' : 'Save to repository'}
        </Button>
      </div>

      {(error || (tried && blocking.length > 0)) && (
        <div className="min-w-0 space-y-2 overflow-hidden rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">{error ?? 'Fix these before saving'}</p>
          <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-muted-foreground">
            {[...(tried ? blocking : []), ...issues].map((p, i) => (
              <li key={i} className="break-words">
                {p.field !== undefined || p.details ? (
                  <button type="button" className="text-left underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground" onClick={() => goTo(p)}>
                    {p.message}
                  </button>
                ) : (
                  p.message
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section id="details" className="scroll-mt-4 space-y-3 rounded-md border p-4">
        <h2 className="text-sm font-medium">{kind === 'data' ? 'Data file' : 'Collection'}</h2>
        <CollectionFields
          kind={kind}
          draft={details}
          isNew={false}
          contentDir={config.content_dir}
          groups={groupOptions(config, kind)}
          onChange={(patch) => setDetails((d) => (d ? { ...d, ...patch } : d))}
        />
      </section>

      <h2 className="pt-2 text-sm font-medium">Parameters</h2>
      <ul className="space-y-2">
        {fields.map((f, i) => {
          const open = openIndex === i
          const TypeIcon = FIELD_TYPE_ICONS[f.type]
          return (
            <li
              key={i}
              id={`param-${i}`}
              {...drag.rowProps(i)}
              className={cn('scroll-mt-4 rounded-md border bg-background', drag.over === i && drag.from !== i && 'relative z-10 ring-2 ring-ring')}
            >
              <div className="flex items-center gap-2 p-2">
                <span {...drag.handleProps} className="cursor-grab text-muted-foreground" aria-hidden><GripVertical className="size-4" /></span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenIndex(open ? null : i)}>
                  <div className="truncate text-sm font-medium">
                    {f.label || <span className="text-muted-foreground">Untitled</span>}
                    {f.required && <span className="text-destructive"> *</span>}
                  </div>
                  <code className="text-xs text-muted-foreground">{f.id}</code>
                </button>
                <Badge variant="secondary"><TypeIcon /> {FIELD_TYPE_LABELS[f.type]}</Badge>
                <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label={`Remove ${f.label}`}><Trash2 /></Button>
                <Button variant="ghost" size="icon" onClick={() => setOpenIndex(open ? null : i)} aria-label={open ? 'Collapse' : 'Expand'}>
                  <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
                </Button>
              </div>
              {open && (
                <div className="border-t p-4">
                  <FieldSettings
                    key={i}
                    field={f}
                    original={col.fields.find((x) => x.id === rows[i].originalId)}
                    onChange={(patch) => update(i, patch)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setRows([...rows, { field: newField(fields) }])
            setOpenIndex(rows.length)
          }}
        >
          <Plus /> Add parameter
        </Button>
        {kind === 'collection' && missingCoreFields(fields).length > 0 && (
          // Existing rows are kept by identity, so a renamed field still knows its original id.
          <Button variant="outline" onClick={() => setRows(withCoreFields(fields).map((f) => rows.find((r) => r.field === f) ?? { field: f }))}>
            <Plus /> Add defaults: {missingCoreFields(fields).map((f) => f.label).join(', ')}
          </Button>
        )}
      </div>
    </div>
  )
}

function FieldSettings({ field, original, onChange }: {
  field: Field
  original?: Field
  onChange: (patch: Partial<Field>) => void
}) {
  const [idTouched, setIdTouched] = useState(true)
  const [advanced, setAdvanced] = useState(false)
  const renamed = !!original && original.id !== field.id

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${field.id}-label`}>Parameter name</Label>
          <Input
            id={`${field.id}-label`}
            value={field.label}
            onChange={(e) => {
              const label = e.target.value
              onChange(idTouched && original ? { label } : { label, id: idFrom(label) || field.id })
            }}
          />
          <p className="text-xs text-muted-foreground">Shown to editors in the CMS.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${field.id}-id`}>Parameter ID</Label>
          <Input
            id={`${field.id}-id`}
            value={field.id}
            className="font-mono"
            onChange={(e) => {
              setIdTouched(true)
              onChange({ id: e.target.value })
            }}
          />
          <p className="text-xs text-muted-foreground">
            The key in frontmatter — <code>{`{{ .Params.${field.id || 'id'} }}`}</code>
          </p>
        </div>
      </div>

      {renamed && (
        <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-700 dark:bg-amber-950">
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            The ID changed from <code>{original!.id}</code> to <code>{field.id}</code>. Existing entries keep the old key
            and templates reading <code>.Params.{original!.id}</code> will stop finding a value. Nothing is renamed for you.
          </span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${field.id}-type`}>Parameter type</Label>
          <FieldTypePicker
            id={`${field.id}-type`}
            value={field.type}
            onChange={(type) =>
              onChange({
                type,
                options: isChoice(type) ? (field.options ?? []) : undefined,
                options_from: isChoice(type) ? field.options_from : undefined,
                fields: isNested(type) ? (field.fields ?? []) : undefined,
              })
            }
          />
        </div>
        <div className="flex items-end gap-3 pb-2">
          <Switch id={`${field.id}-required`} checked={field.required} onCheckedChange={(v) => onChange({ required: v })} />
          <Label htmlFor={`${field.id}-required`}>Required</Label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${field.id}-panel`}>Placement</Label>
          <Select value={fieldPanel(field)} onValueChange={(v) => onChange({ panel: v as 'main' | 'sidebar' })}>
            <SelectTrigger id={`${field.id}-panel`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="main">Main column</SelectItem>
              <SelectItem value="sidebar">Side panel</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Where this appears in the content editor.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${field.id}-placeholder`}>Placeholder</Label>
          <Input id={`${field.id}-placeholder`} value={field.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value || undefined })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${field.id}-default`}>Default value</Label>
          <DefaultValueInput field={field} onChange={onChange} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${field.id}-help`}>Description / help text</Label>
        <Textarea id={`${field.id}-help`} rows={2} value={field.help ?? ''} onChange={(e) => onChange({ help: e.target.value || undefined })} />
      </div>

      {isChoice(field.type) && <OptionsEditor field={field} onChange={onChange} />}
      {isNested(field.type) && <ChildFieldsEditor field={field} onChange={onChange} />}

      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdvanced((a) => !a)}>
          <ChevronDown className={cn('transition-transform', advanced && 'rotate-180')} /> Advanced settings
        </Button>
        {advanced && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <NumberSetting
              label={isNumber(field.type) ? 'Minimum value' : MULTI_CHOICE_TYPES.includes(field.type as never) ? 'Minimum selections' : 'Minimum length'}
              value={field.min}
              onChange={(min) => onChange({ min })}
            />
            <NumberSetting
              label={isNumber(field.type) ? 'Maximum value' : MULTI_CHOICE_TYPES.includes(field.type as never) ? 'Maximum selections' : 'Maximum length'}
              value={field.max}
              onChange={(max) => onChange({ max })}
            />
            {isText(field.type) && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${field.id}-pattern`}>Pattern (regular expression)</Label>
                <Input id={`${field.id}-pattern`} className="font-mono" value={field.pattern ?? ''} onChange={(e) => onChange({ pattern: e.target.value || undefined })} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DefaultValueInput({ field, onChange }: { field: Field; onChange: (patch: Partial<Field>) => void }) {
  const id = `${field.id}-default`
  if (field.type === 'boolean') {
    return (
      <div className="flex h-9 items-center">
        <Switch id={id} checked={field.default === true} onCheckedChange={(v) => onChange({ default: v })} />
      </div>
    )
  }
  if (isNumber(field.type)) {
    return (
      <Input
        id={id}
        type="number"
        value={field.default == null ? '' : String(field.default)}
        onChange={(e) => onChange({ default: e.target.value === '' ? undefined : Number(e.target.value) })}
      />
    )
  }
  return (
    <Input
      id={id}
      value={field.default == null ? '' : String(field.default)}
      onChange={(e) => onChange({ default: e.target.value || undefined })}
    />
  )
}

function NumberSetting({ label, value, onChange }: { label: string; value?: number; onChange: (v?: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </div>
  )
}

function OptionsEditor({ field, onChange }: { field: Field; onChange: (patch: Partial<Field>) => void }) {
  const options = field.options ?? []
  const [fromRepo, setFromRepo] = useState(!!field.options_from)
  const drag = useDragList((from, to) => onChange({ options: move(options, from, to) }))
  const set = (i: number, patch: Partial<Option>) =>
    onChange({ options: options.map((o, n) => (n === i ? { ...o, ...patch } : o)) })

  return (
    <div className="space-y-2">
      <Label>Options</Label>
      <div className="flex w-fit gap-1 rounded-md border p-1">
        <Button type="button" size="xs" variant={fromRepo ? 'ghost' : 'secondary'} aria-pressed={!fromRepo} onClick={() => { setFromRepo(false); onChange({ options_from: undefined }) }}>
          Listed here
        </Button>
        <Button type="button" size="xs" variant={fromRepo ? 'secondary' : 'ghost'} aria-pressed={fromRepo} onClick={() => setFromRepo(true)}>
          From the repository
        </Button>
      </div>
      {fromRepo ? <OptionsSource field={field} onChange={onChange} /> : (
      <>
      <p className="text-xs text-muted-foreground">The label is shown in the CMS; the value is what gets written to the content file.</p>
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li
            key={i}
            {...drag.rowProps(i)}
            className={cn('flex items-center gap-2 bg-background', drag.over === i && drag.from !== i && 'relative z-10 rounded ring-2 ring-ring')}
          >
            <span {...drag.handleProps} className="cursor-grab text-muted-foreground" aria-hidden><GripVertical className="size-4" /></span>
            <Input value={o.label} placeholder="Label" onChange={(e) => set(i, { label: e.target.value })} />
            <Input value={o.value} placeholder="value" className="font-mono" onChange={(e) => set(i, { value: e.target.value })} />
            <Button variant="ghost" size="icon" aria-label={`Remove ${o.label}`} onClick={() => onChange({ options: options.filter((_, n) => n !== i) })}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ options: [...options, { label: '', value: '' }] })}
      >
        <Plus /> Add option
      </Button>
      </>
      )}
    </div>
  )
}

/**
 * Points a choice field at a data file (a registry keyed by slug) or a content folder, and
 * previews what it would offer so a wrong path shows up before saving.
 */
function OptionsSource({ field, onChange }: { field: Field; onChange: (patch: Partial<Field>) => void }) {
  const { data } = useFetch<{ folders: string[]; dataFiles: string[] }>('/folders')
  const contentDir = useConfig().config?.content_dir ?? 'content'
  const from = field.options_from ?? ''
  // Checked a moment after typing stops, so every keystroke is not a trip to GitHub.
  const [checked, setChecked] = useState(from.trim())
  useEffect(() => {
    const t = setTimeout(() => setChecked(from.trim()), 400)
    return () => clearTimeout(t)
  }, [from])
  const preview = useFetch<{ options: Option[] }>(checked ? `/options?from=${encodeURIComponent(checked)}` : null)
  const found = preview.data?.options ?? []

  return (
    <div className="space-y-1.5">
      <Combobox
        id={`${field.id}-options-from`}
        value={from}
        mono
        placeholder="data/platforms.yaml or content/categories"
        browseLabel="Browse data files and folders"
        options={[...(data?.dataFiles ?? []), ...(data?.folders ?? []).filter((f) => f.startsWith(`${contentDir}/`))]}
        // A source replaces a hand-made list, so the list is not left behind in the config.
        onChange={(v) => onChange({ options_from: v || undefined, options: undefined })}
      />
      <p className="text-xs text-muted-foreground">
        A data file keyed by slug, like <code>windows: {'{ name: Windows }'}</code>, or a content folder with one page per
        option. The key or slug is written to the content file; the name or title is shown.
      </p>
      {checked && preview.error && <p className="text-xs text-destructive">{preview.error.message}</p>}
      {checked && preview.data && (
        <p className="text-xs text-muted-foreground">
          {found.length
            ? `${found.length} option${found.length === 1 ? '' : 's'}: ${found.slice(0, 6).map((o) => o.label).join(', ')}${found.length > 6 ? ', …' : ''}`
            : 'Nothing to choose from in there yet.'}
        </p>
      )}
    </div>
  )
}

function ChildFieldsEditor({ field, onChange }: { field: Field; onChange: (patch: Partial<Field>) => void }) {
  const children = field.fields ?? []
  const drag = useDragList((from, to) => onChange({ fields: move(children, from, to) }))
  const set = (i: number, patch: Partial<Field>) =>
    onChange({ fields: children.map((c, n) => (n === i ? { ...c, ...patch } : c)) })

  return (
    <div className="space-y-2">
      <Label>Child parameters</Label>
      <p className="text-xs text-muted-foreground">
        {field.type === 'repeater' ? 'Each repeated item has these parameters.' : 'Stored as a nested group under this ID.'}
      </p>
      <ul className="space-y-2">
        {children.map((child, i) => (
          <li
            key={i}
            {...drag.rowProps(i)}
            className={cn('flex flex-wrap items-center gap-2 rounded-md border bg-background p-2', drag.over === i && drag.from !== i && 'relative z-10 ring-2 ring-ring')}
          >
            <span {...drag.handleProps} className="cursor-grab text-muted-foreground" aria-hidden><GripVertical className="size-4" /></span>
            <Input value={child.label} placeholder="Name" className="max-w-40" onChange={(e) => set(i, { label: e.target.value, id: idFrom(e.target.value) || child.id })} />
            <Input value={child.id} placeholder="id" className="max-w-40 font-mono" onChange={(e) => set(i, { id: e.target.value })} />
            <FieldTypePicker value={child.type} exclude={NESTED_TYPES} className="w-44" onChange={(type) => set(i, { type })} />
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={child.required} onCheckedChange={(v) => set(i, { required: v })} /> Required
            </label>
            <Button variant="ghost" size="icon" aria-label={`Remove ${child.label}`} onClick={() => onChange({ fields: children.filter((_, n) => n !== i) })}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ fields: [...children, { id: `field_${children.length + 1}`, label: '', type: 'text', required: false }] })}
      >
        <Plus /> Add child parameter
      </Button>
    </div>
  )
}
