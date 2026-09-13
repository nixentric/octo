import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { addDays, addMonths, monthGrid, sameDay, toYMD } from '@/lib/calendar'
import { cn } from '@/lib/utils'

const buttonFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const startOfToday = () => {
  const t = new Date()
  return new Date(t.getFullYear(), t.getMonth(), t.getDate())
}

/** A calendar in a popover, drawn with the app's own styles instead of the browser's picker. */
export function DatePicker({ id, value, onChange }: {
  id?: string
  value: Date | null
  onChange: (day: Date | null) => void
}) {
  const [open, setOpen] = useState(false)
  const content = useRef<HTMLDivElement>(null)
  const pick = (day: Date | null) => {
    onChange(day)
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {/* The field's <label> names this button, so the date itself is read out as its description. */}
        <Button
          id={id}
          variant="outline"
          aria-describedby={id && `${id}-value`}
          className={cn('w-44 justify-start font-normal', !value && 'text-muted-foreground')}
        >
          <CalendarDays /> <span id={id && `${id}-value`}>{value ? buttonFmt.format(value) : 'Pick a date'}</span>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={content}
          align="start"
          sideOffset={4}
          className="z-50 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
          // Land on the chosen day, not the first button, so the arrow keys work straight away.
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            content.current?.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus()
          }}
        >
          <Calendar value={value} onSelect={pick} />
          <div className="mt-2 flex justify-between border-t pt-2">
            <Button variant="ghost" size="xs" onClick={() => pick(startOfToday())}>Today</Button>
            {value && <Button variant="ghost" size="xs" onClick={() => pick(null)}>Clear</Button>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

const KEYS: Record<string, (d: Date) => Date> = {
  ArrowLeft: (d) => addDays(d, -1),
  ArrowRight: (d) => addDays(d, 1),
  ArrowUp: (d) => addDays(d, -7),
  ArrowDown: (d) => addDays(d, 7),
  PageUp: (d) => addMonths(d, -1),
  PageDown: (d) => addMonths(d, 1),
  Home: (d) => addDays(d, -((d.getDay() + 6) % 7)),
  End: (d) => addDays(d, 6 - ((d.getDay() + 6) % 7)),
}

type View = 'days' | 'months' | 'years'
/** The heading steps through the views in this order, back round to days. */
const NEXT_VIEW: Record<View, View> = { days: 'months', months: 'years', years: 'days' }
/** How far the arrows move in each view, in months. */
const STEP: Record<View, [number, string]> = { days: [1, 'month'], months: [12, 'year'], years: [120, 'decade'] }
const monthNameFmt = new Intl.DateTimeFormat('en-GB', { month: 'short' })
const CELL = 'flex items-center justify-center rounded-md text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring'
const PICKED = 'bg-primary text-primary-foreground hover:bg-primary/90'

function Calendar({ value, onSelect }: { value: Date | null; onSelect: (day: Date) => void }) {
  // Every view shows the period holding the focused day, so one date drives all three.
  const [focused, setFocused] = useState(() => value ?? startOfToday())
  const [view, setView] = useState<View>('days')
  const root = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)
  const today = new Date()
  const year = focused.getFullYear()
  const decade = Math.floor(year / 10) * 10
  const [step, unit] = STEP[view]

  // Moving by keyboard, or picking a month or year, unmounts the focused button and drops focus
  // to the body; put it back on the matching cell of whatever is shown now.
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    root.current?.querySelector<HTMLElement>('[data-current]')?.focus()
  }, [focused, view])

  const jump = (months: number, next: View) => {
    refocus.current = true
    setFocused(addMonths(focused, months))
    setView(next)
  }

  return (
    <div ref={root} className="w-64 space-y-1">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" aria-label={`Previous ${unit}`} onClick={() => setFocused(addMonths(focused, -step))}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="sm" aria-live="polite" onClick={() => setView(NEXT_VIEW[view])}>
          {view === 'days' ? monthFmt.format(focused) : view === 'months' ? year : `${decade} – ${decade + 9}`}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Next ${unit}`} onClick={() => setFocused(addMonths(focused, step))}>
          <ChevronRight />
        </Button>
      </div>

      {view === 'days' && (
        <>
          <div className="grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden>
            {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div
            role="group"
            aria-label={monthFmt.format(focused)}
            className="grid grid-cols-7 gap-y-0.5"
            onKeyDown={(e) => {
              const move = KEYS[e.key]
              if (!move) return
              e.preventDefault()
              refocus.current = true
              setFocused(move(focused))
            }}
          >
            {monthGrid(focused).map((day) => {
              const selected = !!value && sameDay(day, value)
              const isToday = sameDay(day, today)
              const current = sameDay(day, focused)
              return (
                <button
                  key={toYMD(day)}
                  type="button"
                  data-day={toYMD(day)}
                  data-current={current || undefined}
                  tabIndex={current ? 0 : -1}
                  aria-label={dayFmt.format(day)}
                  aria-pressed={selected}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => onSelect(day)}
                  className={cn(
                    'mx-auto size-8',
                    CELL,
                    day.getMonth() !== focused.getMonth() && 'text-muted-foreground/50',
                    isToday && !selected && 'border',
                    selected && PICKED,
                  )}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* h-56 keeps the popover about as tall as the day grid, so switching views does not jolt it. */}
      {view === 'months' && (
        <div role="group" aria-label={String(year)} className="grid h-56 grid-cols-3 grid-rows-4 gap-1">
          {Array.from({ length: 12 }, (_, m) => {
            const selected = !!value && value.getFullYear() === year && value.getMonth() === m
            return (
              <button
                key={m}
                type="button"
                data-current={m === focused.getMonth() || undefined}
                aria-pressed={selected}
                onClick={() => jump(m - focused.getMonth(), 'days')}
                className={cn(CELL, selected && PICKED)}
              >
                {monthNameFmt.format(new Date(year, m, 1))}
              </button>
            )
          })}
        </div>
      )}

      {view === 'years' && (
        <div role="group" aria-label={`${decade} to ${decade + 9}`} className="grid h-56 grid-cols-3 grid-rows-4 gap-1">
          {Array.from({ length: 12 }, (_, i) => decade - 1 + i).map((y) => {
            const selected = !!value && value.getFullYear() === y
            return (
              <button
                key={y}
                type="button"
                data-current={y === year || undefined}
                aria-pressed={selected}
                onClick={() => jump((y - year) * 12, 'months')}
                className={cn(CELL, (y < decade || y > decade + 9) && 'text-muted-foreground/50', selected && PICKED)}
              >
                {y}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
