import { useSyncExternalStore } from 'react'
import {
  ChevronDown, Code, Ellipsis, Heading2, Heading3, Heading4, Heading5, Heading6, List, ListOrdered, ListTodo, Pilcrow, SquareCode, Subscript, Superscript, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type Choice<T> = { value: T; label: string; icon: LucideIcon; className?: string }

/** 0 is a plain paragraph. The page title is the heading 1, so the body starts at 2. */
export type HeadingLevel = 0 | 2 | 3 | 4 | 5 | 6
export const HEADINGS: Choice<HeadingLevel>[] = [
  { value: 0, label: 'Paragraph', icon: Pilcrow },
  { value: 2, label: 'Heading 2', icon: Heading2, className: 'text-lg font-semibold' },
  { value: 3, label: 'Heading 3', icon: Heading3, className: 'text-base font-semibold' },
  { value: 4, label: 'Heading 4', icon: Heading4, className: 'font-semibold' },
  { value: 5, label: 'Heading 5', icon: Heading5, className: 'font-semibold' },
  { value: 6, label: 'Heading 6', icon: Heading6, className: 'text-xs font-semibold' },
]

export type ScriptKind = 'sub' | 'sup'
export const SCRIPTS: Choice<ScriptKind>[] = [
  { value: 'sub', label: 'Subscript', icon: Subscript },
  { value: 'sup', label: 'Superscript', icon: Superscript },
]

export type ListKind = 'bullet' | 'ordered' | 'task'
export const LISTS: Choice<ListKind>[] = [
  { value: 'bullet', label: 'Bullet list', icon: List },
  { value: 'ordered', label: 'Numbered list', icon: ListOrdered },
  { value: 'task', label: 'Task list', icon: ListTodo },
]

export type CodeKind = 'inline' | 'block'
export const CODES: Choice<CodeKind>[] = [
  { value: 'inline', label: 'Inline code', icon: Code },
  { value: 'block', label: 'Code block', icon: SquareCode },
]

/** A toolbar button that opens related formats, showing the one in use when there is one. */
export function ToolMenu<T>({ label, icon, choices, current, onPick, disabled }: {
  label: string
  /** Shown while none of the choices is in use. */
  icon: LucideIcon
  choices: Choice<T>[]
  /** The choice in use, if any; it lights the button up. */
  current?: T
  onPick: (value: T) => void
  disabled?: boolean
}) {
  const active = choices.find((c) => c.value === current)
  const Icon = active?.icon ?? icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={label}
          aria-label={label}
          disabled={disabled}
          className={cn('h-8 gap-0.5 px-1.5', active && 'bg-accent text-foreground')}
        >
          <Icon className="size-4" />
          <ChevronDown className="size-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      {/* Focus goes back to the text being edited, not to this button. */}
      <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
        {choices.map((c) => (
          <DropdownMenuItem key={String(c.value)} onSelect={() => onPick(c.value)} className={cn(c.className, c.value === current && 'bg-accent')}>
            <c.icon /> {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const TOOLS_KEY = 'editor-tools'
const listeners = new Set<() => void>()
const readAllTools = () => {
  try {
    return localStorage.getItem(TOOLS_KEY) === 'all'
  } catch {
    return false // a browser blocking site data keeps the short toolbar
  }
}

/** Whether the toolbars show every tool or only the everyday ones; one choice for this device. */
export const useAllTools = () =>
  useSyncExternalStore((notify) => {
    listeners.add(notify)
    return () => {
      listeners.delete(notify)
    }
  }, readAllTools)

/** Opens or closes the less common tools, like tables and footnotes. */
export function MoreToolsButton() {
  const all = useAllTools()
  const label = all ? 'Fewer tools' : 'More tools'
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={all}
      className={cn('size-8', all && 'bg-accent text-foreground')}
      onClick={() => {
        try {
          localStorage.setItem(TOOLS_KEY, all ? 'basic' : 'all')
        } catch {
          // applied now, not remembered
        }
        listeners.forEach((notify) => notify())
      }}
    >
      <Ellipsis className="size-4" />
    </Button>
  )
}
