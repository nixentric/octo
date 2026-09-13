import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { CollectionStats, DayCount } from '@/core/stats'
import { formatDateTime } from '@/lib/format'
import { useFetch } from '@/lib/use-fetch'
import { cn } from '@/lib/utils'

type StatsResponse = {
  collections: (CollectionStats & {
    stale: { slug: string; title: string; updatedAt?: string }[]
    draftEntries: { slug: string; title: string }[]
  })[]
  activity: DayCount[]
}

export function ContentStats() {
  const { data, error, showLoading } = useFetch<StatsResponse>('/stats')

  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  if (!data) return showLoading ? <StatsSkeleton /> : null

  const drafts = data.collections.flatMap((c) => c.draftEntries.map((d) => ({ ...d, collection: c })))
  const stale = data.collections
    .flatMap((c) => c.stale.map((s) => ({ ...s, collection: c })))
    .sort((a, b) => ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? -1 : 1))
    .slice(0, 5)

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Content</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.collections.map((c) => (
            <li key={c.name} className="rounded-md border p-3">
              <Link to={`/content/${c.name}`} className="text-sm font-medium hover:underline">{c.label}</Link>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{c.total}</span>
                <span className="text-xs text-muted-foreground">
                  {c.published} published{c.drafts > 0 && `, ${c.drafts} draft`}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {c.lastUpdated ? `Last edited ${formatDateTime(c.lastUpdated)}` : 'Nothing here yet'}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Activity days={data.activity} />

      <div className="grid gap-8 lg:grid-cols-2">
        <EntryList
          title="Drafts"
          empty="No drafts — everything is published."
          items={drafts.map((d) => ({ key: `${d.collection.name}/${d.slug}`, to: `/content/${d.collection.name}/edit/${d.slug}`, title: d.title, note: d.collection.label }))}
        />
        <EntryList
          title="Least recently edited"
          empty="Nothing to show yet."
          items={stale.map((s) => ({ key: `${s.collection.name}/${s.slug}`, to: `/content/${s.collection.name}/edit/${s.slug}`, title: s.title, note: s.updatedAt ? formatDateTime(s.updatedAt) : 'never edited' }))}
        />
      </div>
    </div>
  )
}

function Activity({ days }: { days: DayCount[] }) {
  const peak = Math.max(1, ...days.map((d) => d.count))
  const total = days.reduce((n, d) => n + d.count, 0)

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Activity</h2>
        <span className="text-xs text-muted-foreground">{total} commits in 30 days</span>
      </div>
      <ol className="flex h-20 items-end gap-1">
        {days.map((d) => (
          <li
            key={d.date}
            title={`${d.date}: ${d.count} commit${d.count === 1 ? '' : 's'}`}
            className="flex-1"
            style={{ height: `${Math.max(4, (d.count / peak) * 100)}%` }}
          >
            <div className={cn('size-full rounded-sm', d.count ? 'bg-primary' : 'bg-muted')} />
          </li>
        ))}
      </ol>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{days[0]?.date}</span>
        <span>today</span>
      </div>
    </section>
  )
}

function EntryList({ title, items, empty }: {
  title: string
  items: { key: string; to: string; title: string; note: string }[]
  empty: string
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 px-3 py-2">
              <Link to={i.to} className="min-w-0 flex-1 truncate hover:underline">{i.title}</Link>
              <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">{i.note}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StatsSkeleton() {
  return (
    <div className="space-y-8">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="space-y-2 rounded-md border p-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-32" />
          </li>
        ))}
      </ul>
      <Skeleton className="h-20 w-full" />
    </div>
  )
}
