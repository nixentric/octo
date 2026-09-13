import { Link, useParams, useSearchParams } from 'react-router'
import { ArrowDown, ArrowUp, ExternalLink, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { EntrySummary } from '@/core/types'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { useConfig } from '@/features/config/use-config'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useFetch } from '@/lib/use-fetch'

type ListResponse = { entries: EntrySummary[]; total: number; page: number; perPage: number }

export function CollectionPage() {
  const { collection = '' } = useParams()
  const { config, error: cfgError } = useConfig()
  const [params, setParams] = useSearchParams()
  const confirm = useConfirm()
  const col = config?.collections.find((c) => c.name === collection)

  const q = params.get('q') ?? ''
  const sort = params.get('sort') ?? 'updated'
  const dir = params.get('dir') ?? 'desc'
  const page = Number(params.get('page') ?? 1)

  const query = new URLSearchParams({ q, sort, dir, page: String(page) }).toString()
  const { data, error, showLoading, refetch } = useFetch<ListResponse>(col ? `/entries/${col.name}?${query}` : null)

  async function remove(e: EntrySummary) {
    if (!col) return
    const ok = await confirm({
      title: `Delete "${e.title}"?`,
      body: 'This commits the deletion to the repository.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await api(`/entries/${col.name}/${e.slug}`, { method: 'DELETE', json: { sha: e.sha, title: e.title, path: e.path } })
      refetch()
    } catch (err) {
      confirm({ title: 'Could not delete entry', body: (err as Error).message, alert: true })
    }
  }

  const update = (patch: Record<string, string>) =>
    setParams((p) => {
      for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k)
      return p
    })
  const toggleSort = (key: string) => update({ sort: key, dir: sort === key && dir === 'desc' ? 'asc' : 'desc', page: '' })

  if (cfgError) return <div className="p-6"><ConfigNotice /></div>
  if (!col) return <div className="p-6 text-sm text-muted-foreground">Unknown collection.</div>

  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-semibold">{col.label}</h1>
          <p className="text-xs text-muted-foreground">{col.folder}</p>
        </div>
        <div className="ml-auto flex gap-2">
        <Button variant="outline" asChild>
          <Link to={`/settings/collections/${col.name}`}><SlidersHorizontal /> Parameters</Link>
        </Button>
        {col.create && (
          <Button asChild>
            <Link to={`/content/${col.name}/new`}><Plus /> New {col.label.replace(/s$/, '')}</Link>
          </Button>
        )}
        </div>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          update({ q: new FormData(e.currentTarget).get('q') as string, page: '' })
        }}
      >
        <Input name="q" defaultValue={q} placeholder="Search…" className="max-w-xs" />
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Title" k="title" sort={sort} dir={dir} onClick={toggleSort} />
              <TableHead className="w-28">Status</TableHead>
              <SortHead label="Last updated" k="updated" sort={sort} dir={dir} onClick={toggleSort} className="w-44" />
              <TableHead className="w-36">Author</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {showLoading && !data && Array.from({ length: 5 }, (_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-1.5 h-3 w-28" />
                </TableCell>
                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell />
              </TableRow>
            ))}
            {data?.entries.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">No entries.</TableCell></TableRow>
            )}
            {data?.entries.map((e) => (
              <TableRow key={e.path}>
                <TableCell>
                  <Link to={`/content/${col.name}/edit/${e.slug}`} state={{ path: e.path }} className="font-medium hover:underline">{e.title}</Link>
                  <div className="text-xs text-muted-foreground">{e.slug}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={e.status === 'draft' ? 'warning' : 'success'}>{e.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(e.updatedAt)}</TableCell>
                <TableCell className="text-muted-foreground">{e.author ?? '—'}</TableCell>
                <TableCell className="text-right">
                  {config?.site_url && e.permalink && (
                    <Button variant="ghost" size="icon" asChild aria-label={`View ${e.title} on the site`} title="View on the site">
                      <a href={new URL(e.permalink, config.site_url).toString()} target="_blank" rel="noreferrer"><ExternalLink /></a>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => remove(e)} aria-label={`Delete ${e.title}`}><Trash2 /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && data.total > data.perPage && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} entries · page {data.page} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SortHead({ label, k, sort, dir, onClick, className }: {
  label: string; k: string; sort: string; dir: string; onClick: (k: string) => void; className?: string
}) {
  const active = sort === k
  return (
    <TableHead className={className}>
      <button type="button" onClick={() => onClick(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {active && (dir === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </TableHead>
  )
}
