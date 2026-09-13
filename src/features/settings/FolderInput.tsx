import { useRef, useState } from 'react'
import { ChevronDown, Folder, FolderPlus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useFetch } from '@/lib/use-fetch'
import { cn } from '@/lib/utils'

/**
 * Picks a folder from the repository. Typing still works, because a collection
 * may point at a folder that does not exist yet.
 */
export function FolderInput({ id, value, onChange, placeholder }: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const { data } = useFetch<{ folders: string[] }>('/folders')
  const all = data?.folders ?? []
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Opening the list shows every folder; typing narrows it. Filtering by the
  // current value straight away would hide every sibling folder.
  const [typed, setTyped] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const needle = typed ? value.trim().toLowerCase() : ''
  const matches = all.filter((f) => f.toLowerCase().includes(needle)).slice(0, 50)
  const isNew = typed && value.trim() !== '' && !all.includes(value.trim())

  const choose = (folder: string) => {
    onChange(folder)
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
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <div className="relative flex-1">
          <Input
            id={id}
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            autoComplete="off"
            className="pr-9 font-mono"
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
            aria-label="Browse folders"
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
            <li className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground">
              <FolderPlus className="size-3.5 shrink-0" />
              <span className="truncate">Creates <code>{value.trim()}</code> on the first entry</span>
            </li>
          )}
          {matches.map((folder, i) => (
            <li key={folder}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-sm', i === active && 'bg-accent')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(folder)}
              >
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{folder}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
