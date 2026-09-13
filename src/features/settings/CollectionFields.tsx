import { useRef, useState, type Ref } from 'react'
import { Plus } from 'lucide-react'
import { CollectionIcon, DEFAULT_COLLECTION_ICON, ICON_SUGGESTIONS, iconNames, isIconName } from '@/components/CollectionIcon'
import { Combobox } from '@/components/Combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_GROUP, groupCollections, type Collection } from '@/core/config'
import { slugify } from '@/core/slug'
import { cn } from '@/lib/utils'
import { FolderInput } from './FolderInput'

export type CollectionDraft = { name: string; label: string; folder: string; icon?: string; group: string }

export const draftOf = (c: Collection): CollectionDraft => ({
  name: c.name,
  label: c.label,
  folder: c.folder,
  icon: c.icon,
  group: c.group ?? '',
})

/** Choosing Content is the same as no group, so it is saved as '', which leaves the key out. */
export const groupToSave = (group: string) => (group.trim().toLowerCase() === DEFAULT_GROUP.toLowerCase() ? '' : group.trim())

/** Content is always offered, so a collection can be moved back out of a group. */
export const groupOptions = (collections: Collection[]) => [
  ...new Set([DEFAULT_GROUP, ...groupCollections(collections).map((g) => g.name)]),
]

/** A collection's name, group, icon and folder: used when adding one and on its own settings page. */
export function CollectionFields({ draft, onChange, isNew, contentDir, groups, nameRef }: {
  draft: CollectionDraft
  onChange: (patch: Partial<CollectionDraft>) => void
  isNew: boolean
  contentDir: string
  groups: string[]
  nameRef?: Ref<HTMLInputElement>
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="col-label">Name</Label>
        <Input
          id="col-label"
          ref={nameRef}
          value={draft.label}
          placeholder="Services"
          onChange={(e) => {
            const label = e.target.value
            if (!isNew) return onChange({ label })
            const name = slugify(label)
            onChange({ label, name, folder: name ? `${contentDir}/${name}` : '' })
          }}
        />
        <p className="text-xs text-muted-foreground">Shown in the sidebar.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="col-group">Group</Label>
        <Combobox
          id="col-group"
          value={draft.group}
          placeholder={DEFAULT_GROUP}
          options={groups}
          browseLabel="Browse groups"
          createHint={(group) => <><Plus className="size-3.5 shrink-0" /> New group “{group}”</>}
          onChange={(group) => onChange({ group: group.slice(0, 40) })}
        />
        <p className="text-xs text-muted-foreground">The sidebar heading it is listed under. Pick one, or type a new name.</p>
      </div>

      <IconPicker value={draft.icon} onChange={(icon) => onChange({ icon })} />

      <div className="space-y-1.5">
        <Label htmlFor="col-folder">Folder</Label>
        <FolderInput
          id="col-folder"
          value={draft.folder}
          placeholder={`${contentDir}/services`}
          onChange={(folder) => onChange({ folder })}
        />
        <p className="text-xs text-muted-foreground">
          {isNew ? 'Created on the first entry you save — it does not need to exist yet.' : 'Pointing at a different folder does not move any files.'}
        </p>
      </div>

      {isNew && (
        <p className="text-xs text-muted-foreground">
          URL and config key: <code>{draft.name || '…'}</code>
        </p>
      )}
    </div>
  )
}

/** Icons render in pages as the grid scrolls, since each one is fetched when first shown. */
const ICON_PAGE = 64
const BROWSE_ORDER: string[] = [...ICON_SUGGESTIONS, ...iconNames.filter((n) => !ICON_SUGGESTIONS.includes(n))]

/** Browses or searches every Lucide icon by name, starting with ones common for site content. */
function IconPicker({ value, onChange }: { value?: string; onChange: (icon: string) => void }) {
  const [q, setQ] = useState('')
  const [count, setCount] = useState(ICON_PAGE)
  const grid = useRef<HTMLDivElement>(null)
  const query = q.trim().toLowerCase().replace(/\s+/g, '-')
  const rank = (n: string) => (n === query ? 0 : n.startsWith(query) ? 1 : 2)
  const matches = query
    ? iconNames.filter((n) => n.includes(query)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    : BROWSE_ORDER
  const selected = isIconName(value) ? value : DEFAULT_COLLECTION_ICON

  return (
    <div className="space-y-1.5">
      <Label htmlFor="col-icon">Icon</Label>
      <Input
        id="col-icon"
        type="search"
        placeholder={`Search ${iconNames.length.toLocaleString()} icons…`}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setCount(ICON_PAGE)
          grid.current?.scrollTo({ top: 0 })
        }}
        // Enter would otherwise submit the dialog, and saving commits to the repository.
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      />
      <div
        ref={grid}
        role="group"
        aria-label="Icons"
        className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget
          if (count < matches.length && el.scrollTop + el.clientHeight > el.scrollHeight - 48) setCount(count + ICON_PAGE)
        }}
      >
        {matches.slice(0, count).map((name) => {
          const title = name.replace(/-/g, ' ')
          return (
            <button
              key={name}
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={name === selected}
              onClick={() => onChange(name)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground',
                name === selected ? 'border-ring bg-accent text-foreground' : 'border-transparent',
              )}
            >
              <CollectionIcon name={name} className="size-4" />
            </button>
          )
        })}
      </div>
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <p>
          Selected: {selected.replace(/-/g, ' ')}
          {query && ` · ${matches.length ? `${matches.length} found` : `nothing matches “${q.trim()}”`}`}
        </p>
        <a href="https://lucide.dev" target="_blank" rel="noreferrer" className="shrink-0 underline-offset-2 hover:underline">
          Powered by Lucide
        </a>
      </div>
    </div>
  )
}
