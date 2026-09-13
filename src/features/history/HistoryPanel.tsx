import { Skeleton } from '@/components/ui/skeleton'
import type { Commit } from '@/core/types'
import { firstLine, formatDateTime } from '@/lib/format'
import { useFetch } from '@/lib/use-fetch'
import { cn } from '@/lib/utils'

export function HistoryPanel({ path, activeSha, onSelect }: { path: string; activeSha?: string; onSelect: (c: Commit | null) => void }) {
  const { data, error, showLoading } = useFetch<Commit[]>(`/history?path=${encodeURIComponent(path)}&limit=50`)
  return (
    <div className="text-sm">
      {showLoading && (
        <ul className="divide-y">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex gap-3 px-3 py-2">
              <Skeleton className="mt-0.5 size-5 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="p-3 text-destructive">{error.message}</p>}
      <ul className="divide-y">
        {data?.map((c, i) => (
          <li key={c.sha}>
            <button
              type="button"
              onClick={() => onSelect(i === 0 ? null : c)}
              className={cn('flex w-full gap-3 px-3 py-2 text-left hover:bg-accent', activeSha === c.sha && 'bg-accent')}
            >
              {c.author.avatar ? <img src={c.author.avatar} alt="" className="mt-0.5 size-5 rounded-full" /> : <span className="mt-0.5 size-5 rounded-full bg-muted" />}
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">{formatDateTime(c.date)}{i === 0 && ' · current'}</div>
                <div className="font-medium">{c.author.name}</div>
                <div className="truncate text-muted-foreground">{firstLine(c.message)}</div>
                <code className="text-xs text-muted-foreground">{c.sha.slice(0, 7)}</code>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
