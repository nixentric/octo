import { lazy, Suspense, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Bold, ChevronDown, Code as CodeIcon, GripVertical, Heading, ImageIcon, Maximize2, Minimize2, Asterisk, Strikethrough as StrikethroughIcon, Superscript as SuperscriptIcon, Table as TableIcon, TriangleAlert, Italic, Link as LinkIcon, List, Plus, Quote, Trash2, X } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { TimePicker } from '@/components/TimePicker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { OPTION_TYPES, type Field, type FieldType, type Option } from '@/core/config'
import { MediaPicker } from '@/features/media/MediaPicker'
import { FocusMode } from './focus-mode'
import { CODES, HEADINGS, LISTS, MoreToolsButton, SCRIPTS, ToolMenu, useAllTools, type CodeKind, type HeadingLevel, type ListKind } from './ToolMenu'
import { publicToRaw } from '@/features/media/MediaPage'
import { useConfig } from '@/features/config/use-config'
import { parseDate, toYMD } from '@/lib/calendar'
import { useFetch } from '@/lib/use-fetch'
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
const at = (day: Date, hours: number, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes)

const dateField = (withTime: boolean): FieldComponent =>
  function DateField({ id, value, onChange }) {
    const current = parseDate(value)
    // Date-only fields store the calendar day; datetime fields a UTC timestamp.
    const emit = (d: Date | null) => onChange(!d ? undefined : withTime ? d.toISOString().replace(/\.\d{3}Z$/, 'Z') : toYMD(d))

    return (
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          id={id}
          value={current}
          onChange={(day) => emit(day && withTime ? at(day, current?.getHours() ?? 0, current?.getMinutes() ?? 0) : day)}
        />
        {withTime && (
          <TimePicker
            disabled={!current}
            value={current && { hours: current.getHours(), minutes: current.getMinutes() }}
            onChange={({ hours, minutes }) => current && emit(at(current, hours, minutes))}
          />
        )}
      </div>
    )
  }

/** A time on its own is stored as HH:mm. */
const TimeField: FieldComponent = ({ id, value, onChange }) => {
  const parts = /^(\d{1,2}):(\d{2})/.exec(str(value))
  return (
    <TimePicker
      id={id}
      value={parts && { hours: Number(parts[1]), minutes: Number(parts[2]) }}
      onChange={({ hours, minutes }) => onChange(`${pad(hours)}:${pad(minutes)}`)}
      onClear={() => onChange(undefined)}
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
            className={cn('relative size-24 overflow-hidden rounded border bg-background', drag.over === i && drag.from !== i && 'relative z-10 ring-2 ring-ring')}
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

const VisualMarkdown = lazy(() => import('./VisualMarkdown'))

/** In focus mode the toolbar floats at the bottom of the screen, out of the text's way. */
const FLOATING_TOOLBAR = 'fixed inset-x-0 bottom-4 z-30 mx-auto w-fit max-w-[calc(100vw-2rem)] justify-center bg-popover shadow-lg'

type MarkdownMode = 'visual' | 'markdown'
const MODE_KEY = 'markdown-mode'

/** Formatted text by default, or the Markdown itself; either way the entry stores Markdown. */
const MarkdownField: FieldComponent = (props) => {
  const { config } = useConfig()
  const focus = useContext(FocusMode)
  const [preferred, setPreferred] = useState<MarkdownMode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'markdown' ? 'markdown' : 'visual'
    } catch {
      return 'visual'
    }
  })
  // Set when this content has something the visual editor would not write back as it was.
  const [unsupported, setUnsupported] = useState(false)
  const mode = preferred === 'visual' && !unsupported ? 'visual' : 'markdown'
  const markUnsupported = useCallback(() => setUnsupported(true), [])
  const displaySrc = useCallback((src: string) => (config ? publicToRaw(config, src) : src), [config])

  const choose = (m: MarkdownMode) => {
    setPreferred(m)
    setUnsupported(false) // asking for the visual editor again checks the content again
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // not remembered between visits
    }
  }

  const modes = (
    <div className="flex items-center gap-1">
      <div role="group" aria-label="Editor" className="flex rounded-md bg-muted p-0.5 text-xs">
        {(['visual', 'markdown'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => choose(m)}
            className={cn('rounded px-2 py-1 font-medium text-muted-foreground', mode === m && 'bg-background text-foreground shadow-xs')}
          >
            {m === 'visual' ? 'Visual' : 'Markdown'}
          </button>
        ))}
      </div>
      {focus && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          title={focus.focused ? 'Exit focus mode' : 'Focus mode'}
          aria-label={focus.focused ? 'Exit focus mode' : 'Focus mode'}
          aria-pressed={focus.focused}
          onClick={focus.toggle}
        >
          {focus.focused ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      )}
    </div>
  )

  const blocked = unsupported && preferred === 'visual' ? blockerIn(str(props.value)) : null

  return (
    <div className="space-y-1.5">
      {/* Above the editor, where it is seen right after asking for the visual editor. */}
      {unsupported && preferred === 'visual' && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span>
            The visual editor can’t keep {blocked ? <code className="break-all">{blocked}</code> : 'something in this content'} exactly,
            so it stays in Markdown. Edit or remove that to write here visually.
          </span>
        </p>
      )}
      {mode === 'visual' ? (
        <Suspense fallback={<Skeleton className="h-[27rem]" />}>
          <VisualMarkdown
            id={props.id}
            value={str(props.value)}
            onChange={props.onChange}
            onUnsupported={markUnsupported}
            displaySrc={displaySrc}
            toolbarEnd={modes}
            // No box in focus mode, just the page, with room at the bottom for the floating toolbar.
            className={cn(focus?.focused && 'border-transparent bg-transparent shadow-none focus-within:border-transparent focus-within:ring-0 dark:bg-transparent [&_.ProseMirror]:min-h-[calc(100dvh-6rem)] [&_.ProseMirror]:pb-24')}
            toolbarClassName={cn(focus?.focused && FLOATING_TOOLBAR)}
          />
        </Suspense>
      ) : (
        <MarkdownSource
          {...props}
          toolbarEnd={modes}
          className={cn(focus?.focused && 'min-h-[calc(100dvh-6rem)] border-transparent bg-transparent pb-24 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent')}
          toolbarClassName={cn(focus?.focused && FLOATING_TOOLBAR)}
        />
      )}

    </div>
  )
}

/** The first shortcode or HTML tag in some Markdown: what most likely keeps it out of the visual editor. */
const blockerIn = (md: string) => {
  const found = /\{\{[<%][\s\S]*?[%>]\}\}|<[a-z][\w-]*[^>]*>/i.exec(md)?.[0]
  return found && found.length > 40 ? `${found.slice(0, 40)}…` : found
}

const MarkdownSource = ({ id, field, value, onChange, toolbarEnd, className, toolbarClassName }: Parameters<FieldComponent>[0] & {
  toolbarEnd: ReactNode
  className?: string
  toolbarClassName?: string
}) => {
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

  // Selects the whole lines the caret or selection touches, leaving out a trailing newline.
  const selectLines = (ta: HTMLTextAreaElement) => {
    const start = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1
    const last = ta.selectionEnd > ta.selectionStart && ta.value[ta.selectionEnd - 1] === '\n' ? ta.selectionEnd - 1 : ta.selectionEnd
    const end = ta.value.indexOf('\n', last)
    ta.setSelectionRange(start, end === -1 ? ta.value.length : end)
    return ta.value.slice(ta.selectionStart, ta.selectionEnd)
  }

  const prefixLines = (prefix: string | ((line: number) => string)) => {
    const ta = ref.current
    if (!ta) return
    const text = selectLines(ta) || 'text'
    const mark = typeof prefix === 'string' ? () => prefix : prefix
    const lines = text.split('\n')
    insert(lines.map((line, i) => mark(i) + line).join('\n'), mark(0).length, lines[0].length)
  }
  // A table needs blank lines around it to be read as one.
  const insertTable = () => {
    const ta = ref.current
    if (!ta) return
    const before = ta.value.slice(0, ta.selectionStart)
    const pad = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    insert(`${pad}| Column 1 | Column 2 |\n| --- | --- |\n| Text | Text |\n\n`, pad.length + 2, 'Column 1'.length)
  }
  const code = (kind: CodeKind) => {
    const ta = ref.current
    if (!ta) return
    if (kind === 'inline') return wrap('`', '`', 'code')
    const text = selectLines(ta) || 'code'
    insert(`\`\`\`\n${text}\n\`\`\``, 4, text.length)
  }
  // Swaps whatever list marks the lines have for the chosen kind, or takes them off when they already are that kind.
  // The mark goes at the caret and the note at the end, with its placeholder selected to type over.
  const footnote = () => {
    const ta = ref.current
    if (!ta) return
    const label = Math.max(0, ...[...ta.value.matchAll(/\[\^(\d+)\]/g)].map((m) => Number(m[1]))) + 1
    insert(`[^${label}]`)
    ta.setSelectionRange(ta.value.length, ta.value.length)
    const pad = ta.value.endsWith('\n\n') ? '' : ta.value.endsWith('\n') ? '\n' : '\n\n'
    const note = `[^${label}]: `
    insert(`${pad}${note}Footnote text`, pad.length + note.length, 'Footnote text'.length)
  }
  const listLines = (kind: ListKind) => {
    const ta = ref.current
    if (!ta) return
    const lines = (selectLines(ta) || 'text').split('\n').map((line) => /^(\s*)(?:([-*+] \[[ xX]\] )|([-*+] )|(\d+[.)] ))?(.*)$/.exec(line)!)
    const kindOf = (m: RegExpExecArray) => (m[2] ? 'task' : m[3] ? 'bullet' : m[4] ? 'ordered' : null)
    const off = lines.every((m) => kindOf(m) === kind)
    const mark = (i: number) => (off ? '' : kind === 'ordered' ? `${i + 1}. ` : kind === 'task' ? '- [ ] ' : '- ')
    const [, indent, , , , text] = lines[0]
    insert(lines.map((m, i) => m[1] + mark(i) + m[5]).join('\n'), indent.length + mark(0).length, text.length)
  }

  // Replaces any heading marks already on the lines, so picking another level never stacks them.
  const headingLines = (level: HeadingLevel) => {
    const ta = ref.current
    if (!ta) return
    const text = selectLines(ta)
    if (!text && !level) return
    const prefix = level ? `${'#'.repeat(level)} ` : ''
    const lines = (text || 'Heading').split('\n').map((line) => line.replace(/^#{1,6}\s+/, ''))
    insert(lines.map((line) => prefix + line).join('\n'), prefix.length, lines[0].length)
  }

  const all = useAllTools()
  const tool = (label: string, Icon: typeof Bold, run: () => void) => (
    <Button type="button" variant="ghost" size="icon" className="size-8" title={label} aria-label={label} onClick={run}>
      <Icon className="size-4" />
    </Button>
  )

  return (
    <div className="space-y-1.5">
      <div className={cn('flex flex-wrap items-center gap-0.5 rounded-md border p-1', toolbarClassName)}>
        {tool('Bold', Bold, () => wrap('**'))}
        {tool('Italic', Italic, () => wrap('*'))}
        <ToolMenu label="Heading" icon={Heading} choices={HEADINGS} onPick={headingLines} />
        <ToolMenu label="List" icon={List} choices={LISTS} onPick={listLines} />
        {tool('Link', LinkIcon, () => wrap('[', '](https://)', 'link text'))}
        {tool('Insert image', ImageIcon, () => setPicking(true))}
        {all && (
          <>
            {tool('Strikethrough', StrikethroughIcon, () => wrap('~~'))}
            <ToolMenu
              label="Subscript or superscript"
              icon={SuperscriptIcon}
              choices={SCRIPTS}
              onPick={(kind) => wrap(`<${kind}>`, `</${kind}>`, kind === 'sub' ? '2' : 'n')}
            />
            {tool('Quote', Quote, () => prefixLines('> '))}
            <ToolMenu label="Code" icon={CodeIcon} choices={CODES} onPick={code} />
            {tool('Insert table', TableIcon, insertTable)}
            {tool('Footnote', Asterisk, footnote)}
          </>
        )}
        <MoreToolsButton />
        <div className="ml-auto">{toolbarEnd}</div>
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
        className={cn('min-h-[24rem] font-mono text-sm', className)}
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
          className={cn('space-y-5 rounded-md border bg-background p-4', drag.over === i && drag.from !== i && 'relative z-10 ring-2 ring-ring')}
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
  time: TimeField,
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

export function FieldInput(props: FieldProps) {
  const { field } = props
  if (field.options_from) return <SourcedOptionsField {...props} />
  if (OPTION_TYPES.includes(field.type) && !field.options?.length) return <NoOptions value={props.value} />
  const Component = registry[field.type] ?? TextField
  return <Component {...props} />
}

/** A choice field whose options live in the repository, read before the widget is drawn. */
function SourcedOptionsField({ id, field, value, onChange }: FieldProps) {
  const { data, error } = useFetch<{ options: Option[] }>(`/options?from=${encodeURIComponent(field.options_from!)}`)
  if (error) return <NoOptions value={value} reason={error.message} />
  if (!data) return <Skeleton className="h-9 w-full max-w-xs" />
  if (OPTION_TYPES.includes(field.type) && !data.options.length) {
    return <NoOptions value={value} reason={`Nothing to choose from in ${field.options_from} yet.`} />
  }
  const Component = registry[field.type] ?? TextField
  return <Component id={id} field={{ ...field, options: data.options }} value={value} onChange={onChange} />
}

/** Stands in for a choice widget that would otherwise open onto an empty list. */
function NoOptions({ value, reason = 'No options to choose from yet.' }: { value: unknown; reason?: string }) {
  // Content editors sit under /content/:collection, data file editors under /data/:name.
  const { collection, name } = useParams()
  const settings = collection ? `/settings/collections/${collection}` : name ? `/settings/data/${name}` : null
  const current = list(value).map(String).join(', ')
  return (
    <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
      {reason}{' '}
      {settings && (
        <Link to={settings} className="text-foreground underline underline-offset-2">
          Set up the options
        </Link>
      )}
      {current && <div className="mt-1 text-xs">Current value: <code>{current}</code></div>}
    </div>
  )
}

export function FieldRow({ field, idPrefix, error, hidden, bare, children }: {
  field: Field
  idPrefix: string
  error?: string
  hidden?: boolean
  /** Just the input and its error, without the label and help around it. */
  bare?: boolean
  children: (inputId: string) => ReactNode
}) {
  const inline = field.type === 'boolean'
  return (
    <div hidden={hidden} className={cn('space-y-1.5', inline && 'flex items-center gap-3 space-y-0')}>
      <Label htmlFor={idPrefix} hidden={bare} className={cn(inline && 'order-2')}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      {children(idPrefix)}
      {field.help && !bare && <p className="text-xs text-muted-foreground">{field.help}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
