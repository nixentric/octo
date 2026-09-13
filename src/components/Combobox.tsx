import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** A text field with a dropdown of suggestions: pick one, or type a value that is not listed. */
export function Combobox({ id, value, onChange, options, placeholder, icon: Icon, mono, browseLabel = 'Show options', createHint }: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  /** Drawn beside the field and each option. */
  icon?: LucideIcon
  mono?: boolean
  browseLabel?: string
  /** Shown above the list while the typed value matches no option. */
  createHint?: (value: string) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Opening the list shows every option; typing narrows it. Filtering by the
  // current value straight away would hide all the others.
  const [typed, setTyped] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const needle = typed ? value.trim().toLowerCase() : ''
  const matches = options.filter((o) => o.toLowerCase().includes(needle)).slice(0, 50)
  const isNew = !!createHint && typed && value.trim() !== '' && !options.includes(value.trim())

  const choose = (option: string) => {
    onChange(option)
    setOpen(false)
    setTyped(false)
    inputRef.current?.focus()
  }

  const show = () => {
    setTyped(false)
    setActive(0)
    setOpen(true)
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        <div className="relative flex-1">
          <Input
            id={id}
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            autoComplete="off"
            className={cn('pr-9', mono && 'font-mono')}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setTyped(true)
              setActive(0)
              setOpen(true)
            }}
            onFocus={show}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setOpen(true)
                setActive((a) => Math.min(a + 1, matches.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Escape') {
                setOpen(false)
              } else if (e.key === 'Enter' && open && matches[active]) {
                e.preventDefault()
                choose(matches[active])
              }
            }}
          />
          <button
            type="button"
            aria-label={browseLabel}
            className="absolute inset-y-0 right-0 flex items-center px-2 opacity-50 hover:opacity-100"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (open) setOpen(false)
              else show()
              inputRef.current?.focus()
            }}
          >
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {open && (matches.length > 0 || isNew) && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {isNew && (
            <li className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground">{createHint(value.trim())}</li>
          )}
          {matches.map((option, i) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm', mono && 'font-mono', i === active && 'bg-accent')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(option)}
              >
                {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
                <span className="truncate">{option}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
