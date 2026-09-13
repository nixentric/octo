import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ExternalLink, Lock, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/use-fetch'
import type { RepoInfo } from '@/core/types'
import { logout, useSession } from '@/features/auth/session'

type ReposResponse = { repos: RepoInfo[]; installUrl: string }

export function ConnectRepoPage() {
  const { me, refresh } = useSession()
  const navigate = useNavigate()
  const { data, error, loading, refetch } = useFetch<ReposResponse>('/repos')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<RepoInfo | null>(null)
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const repos = (data?.repos ?? []).filter((r) => r.fullName.toLowerCase().includes(q.toLowerCase()))

  async function connect() {
    if (!selected) return
    setBusy(true)
    setErr(null)
    try {
      await api('/repo', { method: 'POST', json: { owner: selected.owner, name: selected.name, branch: branch || selected.defaultBranch } })
      await refresh()
      navigate('/', { replace: true })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Connect a repository</h1>
          <p className="text-sm text-muted-foreground">Signed in as {me?.user.login}. Pick the repository that holds your site.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>Sign out</Button>
      </div>

      <div className="flex gap-2">
        <Input placeholder="Filter repositories…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="outline" size="icon" onClick={refetch} aria-label="Refresh"><RefreshCw /></Button>
        {data && (
          <Button variant="outline" asChild>
            <a href={data.installUrl} target="_blank" rel="noreferrer">Install app <ExternalLink /></a>
          </Button>
        )}
      </div>

      {loading && (
        <ul className="divide-y rounded-md border">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center justify-between px-3 py-2.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-12" />
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && repos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No repositories available. Install the GitHub App on the repository you want to manage, then refresh.
        </p>
      )}

      <ul className="divide-y rounded-md border">
        {repos.map((r) => (
          <li key={r.fullName}>
            <button
              type="button"
              onClick={() => { setSelected(r); setBranch(r.defaultBranch) }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent ${selected?.fullName === r.fullName ? 'bg-accent' : ''}`}
            >
              <span className="flex items-center gap-2">
                {r.private && <Lock className="size-3.5 text-muted-foreground" />}
                <span className="font-medium">{r.owner}/{r.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">{r.defaultBranch}</span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="space-y-3 rounded-md border p-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Repository</span> <span className="font-medium">{selected.fullName}</span>
          </div>
          <div className="space-y-1">
            <Label htmlFor="branch">Branch</Label>
            <Input id="branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="max-w-xs" />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button onClick={connect} disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</Button>
        </div>
      )}
    </div>
  )
}
