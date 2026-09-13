import { ExternalLink } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Commit, RepoInfo, RepoRef } from '@/core/types'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { useConfig } from '@/features/config/use-config'
import { firstLine, formatDateTime } from '@/lib/format'
import { useFetch } from '@/lib/use-fetch'
import { ContentStats } from './ContentStats'

type RepoResponse = { repo: RepoRef; info: RepoInfo }

export function DashboardPage() {
  const { config } = useConfig()
  const repo = useFetch<RepoResponse>('/repo')
  const history = useFetch<Commit[]>('/history?limit=30')
  const commits = history.data ?? []
  const edits = commits.filter((c) => c.message.startsWith('cms:')).slice(0, 8)

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <ConfigNotice />

      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Repository">
          {repo.data ? (
            <a href={repo.data.info.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
              {repo.data.info.fullName} <ExternalLink className="size-3" />
            </a>
          ) : <Skeleton className="h-5 w-40" />}
        </Stat>
        <Stat label="Branch">{repo.data?.repo.branch ?? <Skeleton className="h-5 w-16" />}</Stat>
        <Stat label="Collections">{config ? config.collections.length : <Skeleton className="h-5 w-6" />}</Stat>
        <Stat label="Site type">{config?.adapter ?? <Skeleton className="h-5 w-14" />}</Stat>
      </dl>

      <ContentStats />

      {/* grid-cols-1 is minmax(0, 1fr): without it a long commit message widens the column past a phone's screen. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <CommitList title="Recent edits" commits={edits} loading={history.showLoading} empty="No edits made through the CMS yet." />
        <CommitList title="Recent commits" commits={commits.slice(0, 8)} loading={history.showLoading} empty="No commits." />
      </div>
      {history.error && <p className="text-sm text-destructive">{history.error.message}</p>}
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

function CommitList({ title, commits, loading, empty }: { title: string; commits: Commit[]; loading: boolean; empty: string }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {loading && (
        <ul className="divide-y rounded-md border">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex items-start gap-3 px-3 py-2">
              <Skeleton className="mt-0.5 size-5 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-40" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {!loading && commits.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
      <ul className="divide-y rounded-md border text-sm">
        {commits.map((c) => (
          <li key={c.sha} className="flex items-start gap-3 px-3 py-2">
            {c.author.avatar ? <img src={c.author.avatar} alt="" className="mt-0.5 size-5 rounded-full" /> : <span className="mt-0.5 size-5 rounded-full bg-muted" />}
            <div className="min-w-0 flex-1">
              <div className="truncate">{firstLine(c.message)}</div>
              <div className="text-xs text-muted-foreground">
                {c.author.name} · {formatDateTime(c.date)} · <code>{c.sha.slice(0, 7)}</code>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
