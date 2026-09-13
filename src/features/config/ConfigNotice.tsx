import { Button } from '@/components/ui/button'
import { CONFIG_PATH } from '@/core/config'
import { useConfig } from './use-config'

const EXAMPLE = `adapter: hugo
media_dir: static/images
public_media_path: /images

collections:
  - name: posts
    label: Posts
    folder: content/posts
    fields:
      - { id: title, name: Title, type: text, required: true }
      - { id: description, name: Description, type: textarea }
      - { id: image, name: Featured Image, type: image }
      - { id: category, name: Category, type: select, options: [News, Promo, Article] }
      - { id: date, name: Publish Date, type: datetime }
      - { id: draft, name: Draft, type: boolean }
      - { id: body, name: Content, type: markdown }`

export function ConfigNotice() {
  const { error, refetch } = useConfig()
  if (!error) return null
  return (
    <div className="min-w-0 space-y-3 overflow-hidden rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
      <p className="font-medium">{error.error}</p>
      {error.issues && (
        <ul className="max-h-64 list-disc overflow-y-auto pl-5 text-muted-foreground">
          {error.issues.map((i, n) => (
            <li key={n} className="break-words"><code className="break-all">{i.path.join('.') || '(root)'}</code>: {i.message}</li>
          ))}
        </ul>
      )}
      {error.status === 'missing' && (
        <>
          <p className="text-muted-foreground">Add a <code>{CONFIG_PATH}</code> file to the root of the repository. Example:</p>
          <pre className="overflow-x-auto rounded bg-background p-3 text-xs">{EXAMPLE}</pre>
        </>
      )}
      <Button size="sm" variant="outline" onClick={refetch}>Reload configuration</Button>
    </div>
  )
}
