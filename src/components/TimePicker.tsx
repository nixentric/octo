import { useLayoutEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { Popover } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type TimeValue = { hours: number; minutes: number }

const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

/** A time of day in a popover, drawn like the calendar: pick the hour, then the minute. */
export function TimePicker({ id, value, onChange, onClear, disabled }: {
  id?: string
  value: TimeValue | null
  onChange: (value: TimeValue) => void
  /** Offered as a Clear button when the time can be left empty. */
  onClear?: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const content = useRef<HTMLDivElement>(null)
  const valueId = id ? `${id}-value` : undefined

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          aria-label="Time"
          aria-describedby={valueId}
          className={cn('w-28 justify-start font-normal tabular-nums', !value && 'text-muted-foreground')}
        >
          <Clock /> <span id={valueId}>{value ? `${pad(value.hours)}:${pad(value.minutes)}` : '--:--'}</span>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={content}
          align="start"
          sideOffset={4}
          className="z-50 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
          // Start on the chosen hour, so the arrow keys work straight away.
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            content.current?.querySelector<HTMLElement>('[data-column] [tabindex="0"]')?.focus()
          }}
        >
          <div className="flex gap-1">
            <Column label="Hours" items={HOURS} selected={value?.hours} onPick={(hours) => onChange({ hours, minutes: value?.minutes ?? 0 })} />
            <Column
              label="Minutes"
              items={MINUTES}
              selected={value?.minutes}
              onPick={(minutes) => {
                onChange({ hours: value?.hours ?? 0, minutes })
                setOpen(false)
              }}
            />
          </div>
          <div className="mt-2 flex justify-between gap-2 border-t pt-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                const now = new Date()
                onChange({ hours: now.getHours(), minutes: now.getMinutes() })
                setOpen(false)
              }}
            >
              Now
            </Button>
            {onClear && value && (
              <Button variant="ghost" size="xs" onClick={() => { onClear(); setOpen(false) }}>Clear</Button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Column({ label, items, selected, onPick }: {
  label: string
  items: number[]
  selected?: number
  onPick: (n: number) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  const current = selected ?? items[0]

  // Open with the chosen value in the middle of its column instead of scrolled to 00.
  useLayoutEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[tabindex="0"]')
    if (list.current && el) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2
  }, [])

  return (
    <div
      ref={list}
      role="group"
      aria-label={label}
      data-column
      className="relative flex max-h-56 w-14 flex-col gap-0.5 overflow-y-auto"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[Math.min(buttons.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
      }}
    >
      {items.map((n) => (
        <button
          key={n}
          type="button"
          // One stop per column for Tab; the arrow keys move within it.
          tabIndex={n === current ? 0 : -1}
          aria-pressed={n === selected}
          onClick={() => onPick(n)}
          className={cn(
            'shrink-0 rounded-md px-2 py-1 text-sm tabular-nums outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
            n === selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {pad(n)}
        </button>
      ))}
    </div>
  )
}
