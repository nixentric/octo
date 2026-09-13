import { useRef, useState, type Ref } from 'react'
import { ChevronDown, EyeOff, FileCode, Folder, Plus, X } from 'lucide-react'
import { CollectionIcon, DEFAULT_COLLECTION_ICON, ICON_SUGGESTIONS, iconNames, isIconName } from '@/components/CollectionIcon'
import { Combobox } from '@/components/Combobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_DATA_GROUP, DEFAULT_GROUP, type Collection, type DataFile } from '@/core/config'
import { slugify } from '@/core/slug'
import { useFetch } from '@/lib/use-fetch'
import { cn } from '@/lib/utils'
import { FolderInput } from './FolderInput'

/** Collections keep entries in a folder under content/; data files are one file under data/. */
export type Kind = 'collection' | 'data'

export type CollectionDraft = {
  name: string
  label: string
  path: string
  icon?: string
  group: string
  /** Entries and folders inside a collection's folder that it leaves out. */
  ignore?: string[]
}

export const DATA_FILE_ICON = 'database'
export const defaultGroup = (kind: Kind) => (kind === 'data' ? DEFAULT_DATA_GROUP : DEFAULT_GROUP)

export const draftOf = (item: Collection | DataFile): CollectionDraft => ({
  name: item.name,
  label: item.label,
  path: 'folder' in item ? item.folder : item.file,
  icon: item.icon,
  group: item.group ?? '',
  ignore: 'folder' in item ? (item.ignore ?? []) : undefined,
})

/** Choosing the default heading is the same as no group, so it is saved as '', which leaves the key out. */
export const groupToSave = (group: string, kind: Kind) =>
  group.trim().toLowerCase() === defaultGroup(kind).toLowerCase() ? '' : group.trim()

/** Every heading in use, the default first, so an item can join any group or go back to its own. */
export const groupOptions = (config: { collections: Collection[]; data: DataFile[] }, kind: Kind) => [
  ...new Set([
    defaultGroup(kind),
    ...config.collections.map((c) => c.group?.trim() || DEFAULT_GROUP),
    ...config.data.map((d) => d.group?.trim() || DEFAULT_DATA_GROUP),
  ]),
]

/** Name, group, icon and where it lives: used when adding a collection and on the settings page of either kind. */
export function CollectionFields({ kind, draft, onChange, isNew, contentDir, groups, nameRef }: {
  kind: Kind
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
          placeholder={kind === 'data' ? 'Platforms' : 'Services'}
          onChange={(e) => {
            const label = e.target.value
            if (!isNew) return onChange({ label })
            const name = slugify(label)
            onChange({ label, name, path: name ? `${contentDir}/${name}` : '' })
          }}
        />
        <p className="text-xs text-muted-foreground">Shown in the sidebar.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="col-group">Group</Label>
        <Combobox
          id="col-group"
          value={draft.group}
          placeholder={defaultGroup(kind)}
          options={groups}
          browseLabel="Browse groups"
          createHint={(group) => <><Plus className="size-3.5 shrink-0" /> New group “{group}”</>}
          onChange={(group) => onChange({ group: group.slice(0, 40) })}
        />
        <p className="text-xs text-muted-foreground">The sidebar heading it is listed under. Pick one, or type a new name.</p>
      </div>

      <IconPicker value={draft.icon} fallback={kind === 'data' ? DATA_FILE_ICON : DEFAULT_COLLECTION_ICON} onChange={(icon) => onChange({ icon })} />

      {kind === 'data' ? (
        <div className="space-y-1.5">
          <Label htmlFor="col-folder">File</Label>
          <DataFileInput id="col-folder" value={draft.path} onChange={(path) => onChange({ path })} />
          <p className="text-xs text-muted-foreground">Pointing at a different file does not move or copy anything.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="col-folder">Folder</Label>
          <FolderInput
            id="col-folder"
            value={draft.path}
            placeholder={`${contentDir}/services`}
            onChange={(path) => onChange({ path })}
          />
          <p className="text-xs text-muted-foreground">
            {isNew ? 'Created on the first entry you save — it does not need to exist yet.' : 'Pointing at a different folder does not move any files.'}
          </p>
        </div>
      )}

      {kind === 'collection' && !isNew && (
        <IgnoreInput folder={draft.path} value={draft.ignore ?? []} onChange={(ignore) => onChange({ ignore })} />
      )}

      {isNew && (
        <p className="text-xs text-muted-foreground">
          URL and config key: <code>{draft.name || '…'}</code>
        </p>
      )}
    </div>
  )
}

/** The paths a collection leaves out, with the folders inside it offered to pick from. */
function IgnoreInput({ folder, value, onChange }: { folder: string; value: string[]; onChange: (ignore: string[]) => void }) {
  const [path, setPath] = useState('')
  const { data } = useFetch<{ folders: string[] }>('/folders')
  const base = folder.replace(/\/+$/, '')
  const suggestions = (data?.folders ?? [])
    .filter((f) => f.startsWith(`${base}/`))
    .map((f) => `${f.slice(base.length + 1)}/`)
    .filter((f) => !value.includes(f))
  const add = () => {
    const next = path.trim().replace(/^\/+/, '')
    if (!next) return
    if (!value.includes(next)) onChange([...value, next])
    setPath('')
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="col-ignore">Hidden from the list</Label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((p) => (
            <li key={p} className="flex items-center gap-1 rounded-md border bg-muted py-0.5 pr-0.5 pl-2 font-mono text-xs">
              {p}
              <button type="button" aria-label={`Show ${p} again`} title="Show again" onClick={() => onChange(value.filter((x) => x !== p))} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        className="flex gap-2"
        // Enter adds the path; in the settings form it would otherwise submit, and saving commits.
        onKeyDown={(e) => {
          // An Enter the suggestion list already used (to pick a folder) does not add it yet.
          if (e.key !== 'Enter' || e.defaultPrevented) return
          e.preventDefault()
          add()
        }}
      >
        <div className="min-w-0 flex-1">
          <Combobox id="col-ignore" value={path} onChange={setPath} options={suggestions} icon={Folder} mono placeholder="tools/ or recent" browseLabel="Browse folders to hide" />
        </div>
        <Button type="button" variant="outline" onClick={add} disabled={!path.trim()}><EyeOff /> Hide</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pages or whole folders you don’t want listed here, for example ones another collection already shows. Pick a folder, or
        type a page’s address, the grey text under its title in the list (like <code>recent</code>). Nothing is deleted. You can
        also hide one from the <strong>⋮</strong> menu in the list.
      </p>
    </div>
  )
}

/** Picks a YAML or JSON file under data/; typing a new path works too, as it is created on the first save. */
export function DataFileInput({ id, value, onChange, exclude = [] }: {
  id?: string
  value: string
  onChange: (path: string) => void
  exclude?: string[]
}) {
  const { data } = useFetch<{ dataFiles: string[] }>('/folders')
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      placeholder="data/platforms.yaml"
      options={(data?.dataFiles ?? []).filter((f) => !exclude.includes(f))}
      icon={FileCode}
      mono
      browseLabel="Browse data files"
      createHint={(path) => <><Plus className="size-3.5 shrink-0" /> Creates <code>{path}</code> on the first save</>}
    />
  )
}

/** Icons render in pages as the grid scrolls, since each one is fetched when first shown. */
const ICON_PAGE = 64
const BROWSE_ORDER: string[] = [...ICON_SUGGESTIONS, ...iconNames.filter((n) => !ICON_SUGGESTIONS.includes(n))]

/** Browses or searches every Lucide icon by name, starting with ones common for site content. */
export function IconPicker({ value, fallback, onChange }: { value?: string; fallback: string; onChange: (icon: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(ICON_PAGE)
  const grid = useRef<HTMLDivElement>(null)
  const query = q.trim().toLowerCase().replace(/\s+/g, '-')
  const rank = (n: string) => (n === query ? 0 : n.startsWith(query) ? 1 : 2)
  const matches = query
    ? iconNames.filter((n) => n.includes(query)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    : BROWSE_ORDER
  const selected = isIconName(value) ? value : fallback
  // The grid stays folded away unless it is opened or something is being searched for.
  const shown = open || !!query
  const fold = () => {
    setOpen(false)
    setQ('')
    setCount(ICON_PAGE)
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="col-icon">Icon</Label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="px-2.5"
          aria-expanded={shown}
          aria-controls="col-icon-grid"
          aria-label={shown ? 'Hide icons' : 'Show icons'}
          title={shown ? 'Hide icons' : 'Show icons'}
          onClick={() => (shown ? fold() : setOpen(true))}
        >
          <CollectionIcon name={selected} className="size-4" />
          <ChevronDown className={cn('size-3.5 opacity-50 transition-transform', shown && 'rotate-180')} />
        </Button>
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
      </div>
      {shown && (
        <div
          ref={grid}
          id="col-icon-grid"
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
                onClick={() => {
                  onChange(name)
                  fold()
                }}
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
      )}
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
