import { Folder, FolderPlus } from 'lucide-react'
import { Combobox } from '@/components/Combobox'
import { useFetch } from '@/lib/use-fetch'

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
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      options={data?.folders ?? []}
      icon={Folder}
      mono
      browseLabel="Browse folders"
      createHint={(folder) => (
        <>
          <FolderPlus className="size-3.5 shrink-0" />
          <span className="truncate">Creates <code>{folder}</code> on the first entry</span>
        </>
      )}
    />
  )
}
