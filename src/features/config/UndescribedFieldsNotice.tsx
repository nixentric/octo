import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CHOICE_TYPES, FIELD_TYPE_LABELS, NESTED_TYPES, type Field, type FieldType } from '@/core/config'
import type { Recommendation } from '@/core/generate-config'
import { FieldTypePicker } from '@/features/settings/FieldTypePicker'

/**
 * Keys that no parameter describes. They are kept when saving but not shown, so this offers to
 * turn them into parameters, each with a type recommended from how the content uses it.
 */
export function UndescribedFieldsNotice({ keys, lead, owner, recommend, onAdd, onDismiss }: {
  keys: string[]
  /** Starts the sentence, e.g. "This entry has". */
  lead: string
  /** The collection or data file the parameters would be added to. */
  owner: string
  recommend: () => Recommendation[] | Promise<Recommendation[]>
  onAdd: (fields: Field[]) => Promise<void>
  onDismiss: () => void
}) {
  const one = keys.length === 1
  const [open, setOpen] = useState(false)
  const [recs, setRecs] = useState<Recommendation[] | null>(null)
  const [types, setTypes] = useState<Record<string, FieldType>>({})
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function review() {
    setRecs(null)
    setTypes({})
    setError(null)
    setOpen(true)
    setRecs(await recommend())
  }

  async function add() {
    setAdding(true)
    setError(null)
    try {
      await onAdd(recs!.map(({ field }) => {
        const type = types[field.id] ?? field.type
        if (type === field.type) return field
        // Options only mean something to a choice.
        const { options: _, options_from: __, ...bare } = field
        return (CHOICE_TYPES as FieldType[]).includes(type) ? { ...field, type } : { ...bare, type }
      }))
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
      <p className="min-w-0 flex-1 basis-64">
        <TriangleAlert className="mr-1.5 inline size-4 -translate-y-px text-amber-600 dark:text-amber-400" />
        {lead} {one ? 'a field' : `${keys.length} fields`} that {owner} has no parameter for:{' '}
        {keys.map((key, i) => (
          <span key={key}>{i > 0 && ', '}<code>{key}</code></span>
        ))}
        . Add {one ? 'it' : 'them'}?
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onDismiss}>Not now</Button>
        <Button size="sm" variant="outline" onClick={review}>Add parameters</Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !adding && setOpen(o)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogTitle>Add parameters to {owner}</DialogTitle>
          <DialogDescription>Each type is recommended from how the entries use the key. Change any that don’t fit.</DialogDescription>
          <ul className="divide-y">
            {recs
              ? recs.map(({ field, habit, uses }) => {
                  const type = types[field.id] ?? field.type
                  return (
                    <li key={field.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0 flex-1 basis-52">
                        <code className="text-sm">{field.id}</code>
                        <p className="text-xs text-muted-foreground">
                          {habit}{uses > 1 && ` · ${uses} entries`}
                        </p>
                      </div>
                      <div className="flex w-full flex-col items-end gap-1 sm:w-48">
                        <FieldTypePicker
                          value={type}
                          recommended={field.type}
                          exclude={NESTED_TYPES}
                          onChange={(t) => setTypes((all) => ({ ...all, [field.id]: t }))}
                        />
                        {type === field.type ? (
                          <Badge variant="success">Recommended</Badge>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            onClick={() => setTypes(({ [field.id]: _, ...rest }) => rest)}
                          >
                            Use {FIELD_TYPE_LABELS[field.type]} instead
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })
              : keys.map((key) => (
                  <li key={key} className="flex items-center gap-4 py-3">
                    <div className="flex-1 space-y-1.5">
                      <code className="text-sm">{key}</code>
                      <Skeleton className="h-3 w-40" />
                    </div>
                    <Skeleton className="h-9 w-48" />
                  </li>
                ))}
          </ul>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={adding}>Cancel</Button>
            <Button onClick={add} disabled={!recs || adding}>
              {adding ? 'Adding…' : `Add ${keys.length} parameter${one ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
