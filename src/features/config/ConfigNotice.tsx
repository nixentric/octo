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
      - { name: title, label: Title, type: text, required: true }
      - { name: description, label: Description, type: textarea }
      - { name: image, label: Featured Image, type: image }
      - { name: date, label: Publish Date, type: datetime }
      - { name: draft, label: Draft, type: boolean }
      - { name: body, label: Content, type: markdown }`

export function ConfigNotice() {
  const { error, refetch } = useConfig()
  if (!error) return null
  return (
    <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
      <p className="font-medium">{error.error}</p>
      {error.issues && (
        <ul className="list-disc pl-5 text-muted-foreground">
          {error.issues.map((i, n) => (
            <li key={n}><code>{i.path.join('.') || '(root)'}</code>: {i.message}</li>
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
