import { useEffect, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router'
import { ArrowLeft, ChevronDown, GripVertical, Plus, Trash2, TriangleAlert } from 'lucide-react'
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
  CHOICE_TYPES, FIELD_ID, FIELD_TYPE_LABELS, FIELD_TYPES, fieldPanel, MULTI_CHOICE_TYPES, NESTED_TYPES,
  type Field, type FieldType, type Option,
} from '@/core/config'
import { slugify } from '@/core/slug'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { useConfig } from '@/features/config/use-config'
import { api, ApiError } from '@/lib/api'
import { useDelayed } from '@/lib/use-delayed'
import { move, useDragList } from '@/lib/use-drag-list'
import { cn } from '@/lib/utils'

const idFrom = (label: string) => slugify(label).replace(/-/g, '_').replace(/^(?=\d)/, 'f_')
const isChoice = (t: FieldType) => (CHOICE_TYPES as string[]).includes(t)
const isNested = (t: FieldType) => (NESTED_TYPES as string[]).includes(t)
const isNumber = (t: FieldType) => t === 'integer' || t === 'decimal'
const isText = (t: FieldType) => ['text', 'textarea', 'markdown', 'code', 'url', 'email', 'slug'].includes(t)

type Row = { field: Field; originalId?: string }

const newField = (existing: Field[]): Field => {
  let id = 'new_field'
  for (let n = 2; existing.some((f) => f.id === id); n++) id = `new_field_${n}`
  return { id, label: 'New field', type: 'text', required: false }
}

export function FieldsPage() {
  const { collection = '' } = useParams()
  const { config, error: cfgError, refetch } = useConfig()
  const col = config?.collections.find((c) => c.name === collection)

  // Rows remember the id each field had when loaded, so a rename is still
  // recognised after the list is reordered.
  const [rows, setRows] = useState<Row[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<string[]>([])
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const confirm = useConfirm()
  const showSkeleton = useDelayed(!col || !rows)

  useEffect(() => {
    if (col && rows === null) setRows(col.fields.map((f) => ({ field: f, originalId: f.id })))
  }, [col, rows])

  const fields = rows?.map((r) => r.field) ?? null
  const dirty = !!col && !!fields && JSON.stringify(fields) !== JSON.stringify(col.fields)

  const blocker = useBlocker(() => dirty)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    confirm({
      title: 'Leave without saving?',
      body: 'Your changes to these parameters will be lost.',
      confirmLabel: 'Leave',
      destructive: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker, confirm])

  const drag = useDragList((from, to) => setRows((r) => (r ? move(r, from, to) : r)))

  if (cfgError) return <div className="p-6"><ConfigNotice /></div>
  if (!col || !rows || !fields) {
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

  const duplicateIds = fields.map((f) => f.id).filter((id, i, all) => all.indexOf(id) !== i)
  const localErrors = fields.flatMap((f) => {
    const problems: string[] = []
    if (!FIELD_ID.test(f.id)) problems.push(`"${f.id || '(empty)'}" is not a valid parameter ID`)
    if (!f.label.trim()) problems.push(`${f.id} needs a name`)
    if (isNested(f.type) && !f.fields?.length) problems.push(`${f.id} is a ${f.type} and needs at least one child`)
    return problems
  })
  const blocking = [...new Set([...localErrors, ...duplicateIds.map((id) => `Duplicate parameter ID "${id}"`)])]

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
    setSaving(true)
    setError(null)
    setIssues([])
    try {
      // Adopt what the server stored rather than clearing: the config fetch is
      // still in flight, and falling back to it would show the pre-save schema.
      const saved = await api<{ fields: Field[] }>(`/config/collections/${col!.name}/fields`, { method: 'PUT', json: { fields } })
      setRows(saved.fields.map((f) => ({ field: f, originalId: f.id })))
      refetch()
    } catch (e) {
      setError((e as Error).message)
      const body = (e as ApiError).body as { issues?: { path: (string | number)[]; message: string }[] } | undefined
      setIssues((body?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`))
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
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{col.label} parameters</h1>
          <p className="text-xs text-muted-foreground">Saved to cms.config.yml in your repository{dirty && ' · unsaved'}</p>
        </div>
        <Button onClick={save} disabled={!dirty || saving || blocking.length > 0}>
          {saving ? 'Saving…' : 'Save to repository'}
        </Button>
      </div>

      {(error || blocking.length > 0) && (
        <div className="min-w-0 space-y-2 overflow-hidden rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">{error ?? 'Fix these before saving'}</p>
          <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-muted-foreground">
            {[...blocking, ...issues].map((m, i) => <li key={i} className="break-words">{m}</li>)}
          </ul>
        </div>
      )}

      <ul className="space-y-2">
        {fields.map((f, i) => {
          const open = openIndex === i
          return (
            <li
              key={i}
              {...drag.rowProps(i)}
              className={cn('rounded-md border bg-background', drag.over === i && drag.from !== i && 'relative z-10 ring-2 ring-ring')}
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
                <Badge variant="secondary">{FIELD_TYPE_LABELS[f.type]}</Badge>
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

      <Button
        variant="outline"
        onClick={() => {
          setRows([...rows, { field: newField(fields) }])
          setOpenIndex(rows.length)
        }}
      >
        <Plus /> Add parameter
      </Button>
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
          <Select
            value={field.type}
            onValueChange={(v) => {
              const type = v as FieldType
              onChange({
                type,
                options: isChoice(type) ? (field.options ?? []) : undefined,
                fields: isNested(type) ? (field.fields ?? []) : undefined,
              })
            }}
          >
            <SelectTrigger id={`${field.id}-type`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
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
  const drag = useDragList((from, to) => onChange({ options: move(options, from, to) }))
  const set = (i: number, patch: Partial<Option>) =>
    onChange({ options: options.map((o, n) => (n === i ? { ...o, ...patch } : o)) })

  return (
    <div className="space-y-2">
      <Label>Options</Label>
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
            <Select value={child.type} onValueChange={(v) => set(i, { type: v as FieldType })}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.filter((t) => !isNested(t)).map((t) => <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
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
