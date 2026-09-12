import { useState, type ReactNode } from 'react'
import { ImageIcon, X } from 'lucide-react'
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

const MarkdownWidget: Widget = ({ id, value, onChange }) => (
  <Textarea id={id} value={str(value)} onChange={(e) => onChange(e.target.value)} className="min-h-[24rem] font-mono text-sm" spellCheck />
)

// ponytail: markdown widget is a plain textarea; swap for a rich editor here when editors ask for one
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
