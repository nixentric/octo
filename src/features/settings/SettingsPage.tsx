import { useNavigate } from 'react-router'
import { useConfirm } from '@/components/confirm'
import { Button } from '@/components/ui/button'
import { CONFIG_PATH } from '@/core/config'
import { useSession } from '@/features/auth/session'
import { ConfigNotice } from '@/features/config/ConfigNotice'
import { useConfig } from '@/features/config/use-config'
import { api } from '@/lib/api'

export function SettingsPage() {
  const { me, refresh } = useSession()
  const { config, refetch } = useConfig()
  const navigate = useNavigate()
  const confirm = useConfirm()

  async function disconnect() {
    const ok = await confirm({
      title: 'Disconnect this repository?',
      body: 'Your content stays in the repository. You can connect it again at any time.',
      confirmLabel: 'Disconnect',
    })
    if (!ok) return
    await api('/repo', { method: 'DELETE' })
    await refresh()
    navigate('/connect', { replace: true })
  }

  return (
    <div className="max-w-2xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Repository</h2>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Repository</dt><dd>{me?.repo?.owner}/{me?.repo?.name}</dd>
          <dt className="text-muted-foreground">Branch</dt><dd>{me?.repo?.branch}</dd>
        </dl>
        <Button variant="outline" size="sm" onClick={disconnect}>Disconnect repository</Button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Site configuration</h2>
          <Button variant="ghost" size="sm" onClick={refetch}>Reload</Button>
        </div>
        <ConfigNotice />
        {config && (
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">Adapter</dt><dd>{config.adapter}</dd>
            <dt className="text-muted-foreground">Content directory</dt><dd><code>{config.content_dir}</code></dd>
            <dt className="text-muted-foreground">Media directory</dt><dd><code>{config.media_dir}</code></dd>
            <dt className="text-muted-foreground">Public media path</dt><dd><code>{config.public_media_path}</code></dd>
            <dt className="text-muted-foreground">Collections</dt>
            <dd>{config.collections.map((c) => <div key={c.name}>{c.label} <span className="text-muted-foreground">· {c.folder}</span></div>)}</dd>
          </dl>
        )}
        <p className="text-xs text-muted-foreground">
          These values come from <code>{CONFIG_PATH}</code> in the repository. Edit that file to change them.
        </p>
      </section>
    </div>
  )
}
