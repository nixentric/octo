import { useRef, useState, type ReactNode } from 'react'
import { Bold, ChevronDown, Code as CodeIcon, GripVertical, Heading2, ImageIcon, Italic, Link as LinkIcon, List, Plus, Quote, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { Field, FieldType } from '@/core/config'
import { MediaPicker } from '@/features/media/MediaPicker'
import { publicToRaw } from '@/features/media/MediaPage'
import { useConfig } from '@/features/config/use-config'
import { move, useDragList } from '@/lib/use-drag-list'
import { cn } from '@/lib/utils'

export type FieldProps = {
  id: string
  field: Field
  value: unknown
  onChange: (value: unknown) => void
}
export type FieldComponent = (props: FieldProps) => ReactNode

const str = (v: unknown) => (v == null ? '' : String(v))
const list = (v: unknown) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const blank = (v: string) => (v === '' ? undefined : v)

// ---------- text ----------

const TextField: FieldComponent = ({ id, field, value, onChange }) => (
  <Input id={id} placeholder={field.placeholder} value={str(value)} onChange={(e) => onChange(blank(e.target.value))} />
)

const TextareaField: FieldComponent = ({ id, field, value, onChange }) => (
  <Textarea id={id} rows={4} placeholder={field.placeholder} value={str(value)} onChange={(e) => onChange(blank(e.target.value))} />
)

const typed = (type: string, className?: string): FieldComponent =>
  function TypedField({ id, field, value, onChange }) {
    return (
      <Input
        id={id}
        type={type}
        className={className}
        placeholder={field.placeholder}
        value={str(value)}
        onChange={(e) => onChange(blank(e.target.value))}
      />
    )
  }

const CodeField: FieldComponent = ({ id, field, value, onChange }) => (
  <Textarea id={id} rows={8} placeholder={field.placeholder} value={str(value)} spellCheck={false} className="font-mono text-sm" onChange={(e) => onChange(blank(e.target.value))} />
)

const ColorField: FieldComponent = ({ id, value, onChange }) => (
  <div className="flex items-center gap-2">
    <Input id={id} type="color" value={str(value) || '#000000'} onChange={(e) => onChange(e.target.value)} className="h-9 w-14 p-1" />
    <Input value={str(value)} placeholder="#1a2b3c" className="max-w-32 font-mono" onChange={(e) => onChange(blank(e.target.value))} />
  </div>
)

const HiddenField: FieldComponent = ({ value }) => (
  <p className="text-xs text-muted-foreground">Hidden — stored as <code>{JSON.stringify(value) ?? 'empty'}</code>.</p>
)

// ---------- numbers ----------

const numberField = (step: string): FieldComponent =>
  function NumberField({ id, field, value, onChange }) {
    return (
      <Input
        id={id}
        type="number"
        step={step}
        min={field.min}
        max={field.max}
        placeholder={field.placeholder}
        className="max-w-48"
        value={str(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    )
  }

// ---------- boolean ----------

const BooleanField: FieldComponent = ({ id, value, onChange }) => (
  <Switch id={id} checked={value === true} onCheckedChange={onChange} />
)

// ---------- date & time ----------

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (v: unknown, withTime: boolean) => {
  if (!v) return ''
  const d = new Date(str(v))
  if (isNaN(d.getTime())) return str(v)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date
}

const dateField = (withTime: boolean): FieldComponent =>
  function DateField({ id, value, onChange }) {
    return (
      <Input
        id={id}
        type={withTime ? 'datetime-local' : 'date'}
        className="max-w-56"
        value={toLocalInput(value, withTime)}
        onChange={(e) =>
          onChange(
            !e.target.value ? undefined : withTime ? new Date(e.target.value).toISOString().replace(/\.\d{3}Z$/, 'Z') : e.target.value,
          )
        }
      />
    )
  }

// ---------- choice ----------

const SelectField: FieldComponent = ({ id, field, value, onChange }) => (
  <Select value={str(value)} onValueChange={onChange}>
    <SelectTrigger id={id} className="w-full max-w-xs"><SelectValue placeholder={field.placeholder ?? 'Select…'} /></SelectTrigger>
    <SelectContent>
      {field.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
    </SelectContent>
  </Select>
)

const RadioField: FieldComponent = ({ id, field, value, onChange }) => (
  <div id={id} role="radiogroup" className="flex flex-wrap gap-x-4 gap-y-2">
    {field.options?.map((o) => (
      <label key={o.value} className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={id}
          checked={str(value) === o.value}
          onChange={() => onChange(o.value)}
          className="size-4 accent-primary"
        />
        {o.label}
      </label>
    ))}
  </div>
)

const CheckboxGroupField: FieldComponent = ({ id, field, value, onChange }) => {
  const selected = list(value).map(String)
  const toggle = (v: string, on: boolean) => onChange(on ? [...selected, v] : selected.filter((s) => s !== v))
  return (
    <div id={id} className="flex flex-wrap gap-x-4 gap-y-2">
      {field.options?.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm">
          <Checkbox checked={selected.includes(o.value)} onCheckedChange={(c) => toggle(o.value, c === true)} /> {o.label}
        </label>
      ))}
    </div>
  )
}

/** Free-form list. Configured options act as suggestions, not limits. */
const TagsField: FieldComponent = ({ id, field, value, onChange }) => {
  const tags = list(value).map(String)
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const options = field.options ?? []
  const suggestions = options.filter((o) => !tags.includes(o.value) && o.label.toLowerCase().includes(draft.trim().toLowerCase()))

  const commit = (raw: string) => {
    const added = raw.split(',').map((t) => t.trim()).filter((t) => t && !tags.includes(t))
    if (added.length) onChange([...tags, ...added])
    setDraft('')
    setActive(0)
  }

  return (
    <div className="relative max-w-xl">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-1.5 py-1 focus-within:ring-[3px] focus-within:ring-ring/50">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded bg-secondary py-0.5 pl-2 pr-1 text-sm">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="opacity-50 hover:opacity-100">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-suggestions`}
          autoComplete="off"
          value={draft}
          onChange={(e) => {
            if (e.target.value.includes(',')) return commit(e.target.value)
            setDraft(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActive((a) => Math.min(a + 1, suggestions.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Escape') {
              setOpen(false)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              commit(open && suggestions[active] ? suggestions[active].value : draft)
            } else if (e.key === 'Backspace' && !draft && tags.length) {
              onChange(tags.slice(0, -1))
            }
          }}
          onBlur={() => {
            if (draft) commit(draft)
            setOpen(false)
          }}
          placeholder={tags.length ? 'Add…' : (field.placeholder ?? 'Type a tag and press Enter')}
          className="min-w-40 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
        {options.length > 0 && (
          <button
            type="button"
            aria-label="Show suggestions"
            className="shrink-0 rounded p-1 opacity-50 hover:bg-accent hover:opacity-100"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen((o) => !o)
              inputRef.current?.focus()
            }}
          >
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul id={`${id}-suggestions`} role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {suggestions.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={cn('w-full rounded px-2 py-1.5 text-left text-sm', i === active && 'bg-accent')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  commit(o.value)
                  inputRef.current?.focus()
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- media ----------

const mediaField = (images: boolean): FieldComponent =>
  function MediaField({ id, field, value, onChange }) {
    const { config } = useConfig()
    const [open, setOpen] = useState(false)
    const url = str(value)
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input id={id} value={url} placeholder={field.placeholder ?? (images ? '/images/example.jpg' : '/files/example.pdf')} onChange={(e) => onChange(blank(e.target.value))} />
          <Button type="button" variant="outline" onClick={() => setOpen(true)}><ImageIcon /> Choose</Button>
          {url && <Button type="button" variant="ghost" size="icon" onClick={() => onChange(undefined)} aria-label="Clear"><X /></Button>}
        </div>
        {url && images && config && <img src={publicToRaw(config, url)} alt="" className="max-h-40 rounded border object-contain" />}
        <MediaPicker open={open} imagesOnly={images} onClose={() => setOpen(false)} onPick={onChange} />
      </div>
    )
  }

const ImagesField: FieldComponent = ({ id, value, onChange }) => {
  const { config } = useConfig()
  const [open, setOpen] = useState(false)
  const urls = list(value).map(String)
  const drag = useDragList((from, to) => onChange(move(urls, from, to)))

  return (
    <div className="space-y-2" id={id}>
      <ul className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <li
            key={`${url}-${i}`}
            {...drag.rowProps(i)}
            className={cn('relative size-24 overflow-hidden rounded border', drag.over === i && drag.from !== i && 'ring-2 ring-ring')}
          >
            {config && <img src={publicToRaw(config, url)} alt="" className="size-full object-cover" />}
            <button
              type="button"
              onClick={() => onChange(urls.filter((_, n) => n !== i))}
              aria-label={`Remove image ${i + 1}`}
              className="absolute right-0.5 top-0.5 rounded bg-background/80 p-0.5 hover:bg-background"
            >
              <X className="size-3" />
            </button>
            <span {...drag.handleProps} className="absolute bottom-0.5 left-0.5 cursor-grab rounded bg-background/80 p-0.5" aria-hidden>
              <GripVertical className="size-3" />
            </span>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><Plus /> Add image</Button>
      <MediaPicker open={open} imagesOnly onClose={() => setOpen(false)} onPick={(url) => onChange([...urls, url])} />
    </div>
  )
}

// ---------- markdown ----------

const MarkdownField: FieldComponent = ({ id, field, value, onChange }) => {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [picking, setPicking] = useState(false)

  // execCommand keeps the browser's native undo stack intact, which a manual splice would destroy.
  const insert = (text: string, selectFrom?: number, selectLen = 0) => {
    const ta = ref.current
    if (!ta) return
    ta.focus()
    document.execCommand('insertText', false, text)
    if (selectFrom != null) {
      const pos = ta.selectionStart - text.length + selectFrom
      ta.setSelectionRange(pos, pos + selectLen)
    }
  }

  // Selecting a line (triple-click) grabs its trailing newline; markers must stay inside it.
  const splitPadding = (raw: string) => {
    const lead = /^\s*/.exec(raw)![0]
    const trail = /\s*$/.exec(raw.slice(lead.length))![0]
    return { lead, trail, core: raw.slice(lead.length, raw.length - trail.length) }
  }

  const wrap = (before: string, after = before, placeholder = 'text') => {
    const ta = ref.current
    if (!ta) return
    const { lead, trail, core } = splitPadding(ta.value.slice(ta.selectionStart, ta.selectionEnd))
    const text = core || placeholder
    insert(lead + before + text + after + trail, lead.length + before.length, text.length)
  }

  const prefixLines = (prefix: string) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1
    ta.setSelectionRange(start, ta.selectionEnd)
    const { trail, core } = splitPadding(ta.value.slice(start, ta.selectionEnd))
    const text = core || 'text'
    insert(text.split('\n').map((line) => prefix + line).join('\n') + trail, prefix.length, text.length)
  }

  const tools = [
    { icon: Bold, label: 'Bold', run: () => wrap('**') },
    { icon: Italic, label: 'Italic', run: () => wrap('*') },
    { icon: Heading2, label: 'Heading', run: () => prefixLines('## ') },
    { icon: LinkIcon, label: 'Link', run: () => wrap('[', '](https://)', 'link text') },
    { icon: List, label: 'Bullet list', run: () => prefixLines('- ') },
    { icon: Quote, label: 'Quote', run: () => prefixLines('> ') },
    { icon: CodeIcon, label: 'Code', run: () => wrap('`', '`', 'code') },
    { icon: ImageIcon, label: 'Insert image', run: () => setPicking(true) },
  ]

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-0.5 rounded-md border p-1">
        {tools.map((t) => (
          <Button key={t.label} type="button" variant="ghost" size="icon" className="size-8" title={t.label} aria-label={t.label} onClick={t.run}>
            <t.icon className="size-4" />
          </Button>
        ))}
      </div>
      <Textarea
        id={id}
        ref={ref}
        value={str(value)}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!(e.metaKey || e.ctrlKey)) return
          if (e.key === 'b') { e.preventDefault(); wrap('**') }
          if (e.key === 'i') { e.preventDefault(); wrap('*') }
        }}
        className="min-h-[24rem] font-mono text-sm"
        spellCheck
      />
      <MediaPicker open={picking} imagesOnly onClose={() => setPicking(false)} onPick={(url) => insert(`![](${url})`, 2, 0)} />
    </div>
  )
}

// ---------- structured ----------

const ObjectField: FieldComponent = ({ id, field, value, onChange }) => {
  const data = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>
  return (
    <div id={id} className="space-y-5 rounded-md border p-4">
      {field.fields?.map((child) => (
        <FieldRow key={child.id} field={child} idPrefix={`${id}-${child.id}`}>
          {(inputId) => (
            <FieldInput
              id={inputId}
              field={child}
              value={data[child.id]}
              onChange={(v) => onChange({ ...data, [child.id]: v })}
            />
          )}
        </FieldRow>
      ))}
    </div>
  )
}

const RepeaterField: FieldComponent = ({ id, field, value, onChange }) => {
  const items = list(value) as Record<string, unknown>[]
  const drag = useDragList((from, to) => onChange(move(items, from, to)))
  const setItem = (i: number, item: Record<string, unknown>) => onChange(items.map((x, n) => (n === i ? item : x)))

  return (
    <div id={id} className="space-y-3">
      {items.map((item, i) => (
        <div
          key={i}
          {...drag.rowProps(i)}
          className={cn('space-y-5 rounded-md border p-4', drag.over === i && drag.from !== i && 'ring-2 ring-ring')}
        >
          <div className="flex items-center gap-2">
            <span {...drag.handleProps} className="cursor-grab text-muted-foreground" aria-hidden><GripVertical className="size-4" /></span>
            <span className="text-xs font-medium text-muted-foreground">{field.label} #{i + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => onChange(items.filter((_, n) => n !== i))}
            >
              <Trash2 /> Remove
            </Button>
          </div>
          {field.fields?.map((child) => (
            <FieldRow key={child.id} field={child} idPrefix={`${id}-${i}-${child.id}`}>
              {(inputId) => (
                <FieldInput
                  id={inputId}
                  field={child}
                  value={(item ?? {})[child.id]}
                  onChange={(v) => setItem(i, { ...(item ?? {}), [child.id]: v })}
                />
              )}
            </FieldRow>
          ))}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, {}])}>
        <Plus /> Add {field.label.toLowerCase().replace(/s$/, '')}
      </Button>
    </div>
  )
}

const KeyValueField: FieldComponent = ({ id, value, onChange }) => {
  const entries = Object.entries((value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>)

  const rename = (i: number, key: string) =>
    onChange(Object.fromEntries(entries.map(([k, v], n) => (n === i ? [key, v] : [k, v]))))
  const setValue = (i: number, v: string) =>
    onChange(Object.fromEntries(entries.map(([k, old], n) => (n === i ? [k, v] : [k, old]))))

  return (
    <div id={id} className="space-y-2">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <Input value={k} placeholder="key" className="max-w-56 font-mono text-xs" onChange={(e) => rename(i, e.target.value)} />
          <Input value={str(v)} placeholder="value" onChange={(e) => setValue(i, e.target.value)} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${k}`} onClick={() => onChange(Object.fromEntries(entries.filter((_, n) => n !== i)))}>
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...Object.fromEntries(entries), '': '' })}>
        <Plus /> Add row
      </Button>
    </div>
  )
}

// ---------- registry ----------

/** Every field type the editor can render. Adding a type here is all a new widget needs. */
export const registry: Record<FieldType, FieldComponent> = {
  text: TextField,
  textarea: TextareaField,
  markdown: MarkdownField,
  integer: numberField('1'),
  decimal: numberField('any'),
  select: SelectField,
  multiselect: CheckboxGroupField,
  radio: RadioField,
  checkbox_group: CheckboxGroupField,
  tags: TagsField,
  boolean: BooleanField,
  date: dateField(false),
  datetime: dateField(true),
  time: typed('time', 'max-w-32'),
  image: mediaField(true),
  images: ImagesField,
  file: mediaField(false),
  url: typed('url'),
  email: typed('email'),
  slug: typed('text', 'font-mono'),
  color: ColorField,
  code: CodeField,
  hidden: HiddenField,
  object: ObjectField,
  repeater: RepeaterField,
  key_value: KeyValueField,
}

export function FieldInput({ id, field, value, onChange }: FieldProps) {
  const Component = registry[field.type] ?? TextField
  return <Component id={id} field={field} value={value} onChange={onChange} />
}

export function FieldRow({ field, idPrefix, error, children }: {
  field: Field
  idPrefix: string
  error?: string
  children: (inputId: string) => ReactNode
}) {
  const inline = field.type === 'boolean'
  return (
    <div className={cn('space-y-1.5', inline && 'flex items-center gap-3 space-y-0')}>
      <Label htmlFor={idPrefix} className={cn(inline && 'order-2')}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      {children(idPrefix)}
      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
