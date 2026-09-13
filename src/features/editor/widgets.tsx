import { useRef, useState, type ReactNode } from 'react'
import { Bold, Code, Heading2, ImageIcon, Italic, Link as LinkIcon, List, Quote, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { Field, WidgetType } from '@/core/config'
import { useConfig } from '@/features/config/use-config'
import { MediaPicker } from '@/features/media/MediaPicker'
import { publicToRaw } from '@/features/media/MediaPage'

export type WidgetProps = { id: string; field: Field; value: unknown; onChange: (v: unknown) => void }
export type Widget = (props: WidgetProps) => ReactNode

const str = (v: unknown) => (v == null ? '' : String(v))

const TextWidget: Widget = ({ id, value, onChange }) => (
  <Input id={id} value={str(value)} onChange={(e) => onChange(e.target.value)} />
)

const TextareaWidget: Widget = ({ id, value, onChange }) => (
  <Textarea id={id} rows={4} value={str(value)} onChange={(e) => onChange(e.target.value)} />
)

const NumberWidget: Widget = ({ id, value, onChange }) => (
  <Input id={id} type="number" value={str(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
)

const BooleanWidget: Widget = ({ id, value, onChange }) => (
  <Switch id={id} checked={value === true} onCheckedChange={onChange} />
)

const SelectWidget: Widget = ({ id, field, value, onChange }) => (
  <Select value={str(value)} onValueChange={onChange}>
    <SelectTrigger id={id} className="w-full max-w-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
    <SelectContent>
      {field.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
    </SelectContent>
  </Select>
)

const MultiSelectWidget: Widget = ({ id, field, value, onChange }) => {
  const selected = Array.isArray(value) ? value.map(String) : []
  const toggle = (o: string, on: boolean) => onChange(on ? [...selected, o] : selected.filter((s) => s !== o))
  return (
    <div id={id} className="flex flex-wrap gap-x-4 gap-y-2">
      {field.options?.map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm">
          <Checkbox checked={selected.includes(o)} onCheckedChange={(c) => toggle(o, c === true)} /> {o}
        </label>
      ))}
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (v: unknown) => {
  const d = new Date(str(v))
  if (!v || isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const DatetimeWidget: Widget = ({ id, value, onChange }) => (
  <Input
    id={id}
    type="datetime-local"
    className="max-w-xs"
    value={toLocalInput(value)}
    onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString().replace(/\.\d{3}Z$/, 'Z') : undefined)}
  />
)

const ImageWidget: Widget = ({ id, value, onChange }) => {
  const { config } = useConfig()
  const [open, setOpen] = useState(false)
  const url = str(value)
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input id={id} value={url} onChange={(e) => onChange(e.target.value)} placeholder="/images/example.jpg" />
        <Button type="button" variant="outline" onClick={() => setOpen(true)}><ImageIcon /> Choose</Button>
        {url && <Button type="button" variant="ghost" size="icon" onClick={() => onChange(undefined)} aria-label="Clear"><X /></Button>}
      </div>
      {url && config && <img src={publicToRaw(config, url)} alt="" className="max-h-40 rounded border object-contain" />}
      <MediaPicker open={open} onClose={() => setOpen(false)} onPick={onChange} />
    </div>
  )
}

const MarkdownWidget: Widget = ({ id, value, onChange }) => {
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

  const wrap = (before: string, after = before, placeholder = 'text') => {
    const ta = ref.current
    if (!ta) return
    const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd) || placeholder
    insert(before + selected + after, before.length, selected.length)
  }

  const prefixLines = (prefix: string) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1
    ta.setSelectionRange(start, ta.selectionEnd)
    const selected = ta.value.slice(start, ta.selectionEnd) || 'text'
    insert(selected.split('\n').map((line: string) => prefix + line).join('\n'))
  }

  const tools = [
    { icon: Bold, label: 'Bold', run: () => wrap('**') },
    { icon: Italic, label: 'Italic', run: () => wrap('*') },
    { icon: Heading2, label: 'Heading', run: () => prefixLines('## ') },
    { icon: LinkIcon, label: 'Link', run: () => wrap('[', '](https://)', 'link text') },
    { icon: List, label: 'Bullet list', run: () => prefixLines('- ') },
    { icon: Quote, label: 'Quote', run: () => prefixLines('> ') },
    { icon: Code, label: 'Code', run: () => wrap('`', '`', 'code') },
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
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!(e.metaKey || e.ctrlKey)) return
          if (e.key === 'b') { e.preventDefault(); wrap('**') }
          if (e.key === 'i') { e.preventDefault(); wrap('*') }
        }}
        className="min-h-[24rem] font-mono text-sm"
        spellCheck
      />
      <MediaPicker open={picking} onClose={() => setPicking(false)} onPick={(url) => insert(`![](${url})`, 2, 0)} />
    </div>
  )
}

export const widgets: Record<WidgetType, Widget> = {
  text: TextWidget,
  textarea: TextareaWidget,
  number: NumberWidget,
  boolean: BooleanWidget,
  select: SelectWidget,
  multiselect: MultiSelectWidget,
  datetime: DatetimeWidget,
  image: ImageWidget,
  markdown: MarkdownWidget,
}

export const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0)
