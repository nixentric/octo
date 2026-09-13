import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CONFIG_PATH } from '@/core/config'
import { api } from '@/lib/api'
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
  const [generating, setGenerating] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [showExample, setShowExample] = useState(false)

  if (!error) return null

  async function generate() {
    setGenerating(true)
    setFailure(null)
    try {
      await api('/config/generate', { method: 'POST' })
      refetch()
    } catch (e) {
      setFailure((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

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
          <p className="text-muted-foreground">
            Octo can write one for you: it reads your content folders and the frontmatter your entries already use, then
            commits <code>{CONFIG_PATH}</code>. Everything in it can be changed afterwards.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={generate} disabled={generating}>
              <Sparkles /> {generating ? 'Reading your repository…' : 'Generate configuration'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowExample((v) => !v)}>
              {showExample ? 'Hide example' : 'Write it myself'}
            </Button>
          </div>
          {showExample && (
            <>
              <p className="text-muted-foreground">Add <code>{CONFIG_PATH}</code> to the root of the repository:</p>
              <pre className="overflow-x-auto rounded bg-background p-3 text-xs">{EXAMPLE}</pre>
            </>
          )}
        </>
      )}

      {failure && <p className="text-destructive">{failure}</p>}
      <Button size="sm" variant="outline" onClick={refetch}>Reload configuration</Button>
    </div>
  )
}
