import { useState } from 'react'
import {
  Braces, Calendar, CalendarClock, ChevronDown, CircleDot, Clock, Code, DecimalsArrowRight, EyeOff, Hash, Image, Images,
  KeyRound, LetterText, Link, ListChecks, Mail, Palette, Paperclip, Pilcrow, Repeat, Slash, SquareCheck, SquareChevronDown,
  Tags, ToggleRight, Type, type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FIELD_TYPE_DESCRIPTIONS, FIELD_TYPE_GROUPS, FIELD_TYPE_LABELS, type FieldType } from '@/core/config'
import { cn } from '@/lib/utils'

export const FIELD_TYPE_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  textarea: LetterText,
  markdown: Pilcrow,
  integer: Hash,
  decimal: DecimalsArrowRight,
  select: SquareChevronDown,
  multiselect: ListChecks,
  radio: CircleDot,
  checkbox_group: SquareCheck,
  tags: Tags,
  boolean: ToggleRight,
  date: Calendar,
  datetime: CalendarClock,
  time: Clock,
  image: Image,
  images: Images,
  file: Paperclip,
  url: Link,
  email: Mail,
  slug: Slash,
  color: Palette,
  code: Code,
  hidden: EyeOff,
  object: Braces,
  repeater: Repeat,
  key_value: KeyRound,
}

/** A button showing the current type that opens every type as a card: icon, name and what it is for. */
export function FieldTypePicker({ id, value, onChange, exclude = [], recommended, className }: {
  id?: string
  value: FieldType
  onChange: (type: FieldType) => void
  exclude?: FieldType[]
  /** Marked on its card, e.g. the type the existing values suggest. */
  recommended?: FieldType
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const Current = FIELD_TYPE_ICONS[value]

  return (
    <>
      <Button id={id} type="button" variant="outline" className={cn('w-full justify-start font-normal', className)} onClick={() => setOpen(true)}>
        <Current /> <span className="truncate">{FIELD_TYPE_LABELS[value]}</span>
        <ChevronDown className="ml-auto opacity-50" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>Choose a parameter type</DialogTitle>
          <DialogDescription>It decides what editors fill in and what is written to the content file.</DialogDescription>
          <div className="space-y-5">
            {FIELD_TYPE_GROUPS.map((group) => {
              const types = group.types.filter((t) => !exclude.includes(t))
              if (!types.length) return null
              return (
                <section key={group.label} className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {types.map((type) => {
                      const Icon = FIELD_TYPE_ICONS[type]
                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={type === value}
                          onClick={() => {
                            onChange(type)
                            setOpen(false)
                          }}
                          className={cn(
                            'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                            type === value && 'border-ring bg-accent',
                          )}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                              {FIELD_TYPE_LABELS[type]}
                              {type === recommended && <Badge variant="success">Recommended</Badge>}
                            </span>
                            <span className="block text-xs text-muted-foreground">{FIELD_TYPE_DESCRIPTIONS[type]}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
