import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Check, ChevronsUpDown, FileText, Image, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Settings } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { RepoInfo } from '@/core/types'
import { logout, useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { useDelayed } from '@/lib/use-delayed'
import { useFetch } from '@/lib/use-fetch'
import { ConfigProvider, useConfig } from '@/features/config/use-config'
import { cn } from '@/lib/utils'

export function AppShell() {
  return (
    <ConfigProvider>
      <Shell />
    </ConfigProvider>
  )
}

function Shell() {
  const { me } = useSession()
  // One state for both layouts: a side panel on wide screens, an overlay on narrow ones.
  const [hidden, setHidden] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar')
      if (saved) return saved === 'hidden'
    } catch {
      // a browser blocking site data just loses the preference between visits
    }
    return window.innerWidth < 768
  })

  const toggle = () => {
    setHidden((was) => {
      const next = !was
      try {
        localStorage.setItem('sidebar', next ? 'hidden' : 'shown')
      } catch {
        // ignored for the same reason as above
      }
      return next
    })
  }

  // Following a link on a narrow screen dismisses the overlay without changing
  // the remembered preference for wide screens.
  const dismissOverlay = () => window.innerWidth < 768 && setHidden(true)

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={hidden ? 'Show menu' : 'Hide menu'}>
          {hidden ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
        <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="size-5" /> Octo
        </NavLink>
        <SiteSwitcher />
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <img src={me?.user.avatar} alt="" className="size-6 rounded-full" />
                <span className="hidden sm:inline">{me?.user.login}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal text-muted-foreground">{me?.user.name ?? me?.user.login}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Starts below the header so the toggle it came from stays lit and reachable. */}
        {!hidden && <div className="fixed inset-x-0 bottom-0 top-12 z-10 bg-black/30 md:hidden" onClick={toggle} />}
        <aside
          className={cn(
            'fixed bottom-0 left-0 top-12 z-20 w-56 shrink-0 overflow-y-auto border-r bg-sidebar transition-transform md:static',
            hidden ? '-translate-x-full md:hidden' : 'translate-x-0',
          )}
        >
          <Sidebar onNavigate={dismissOverlay} />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SiteSwitcher() {
  const { me } = useSession()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  // Fetched up front, not on open: arriving a frame later resizes the menu.
  const { data } = useFetch<{ repos: RepoInfo[] }>('/repos')
  const showSkeleton = useDelayed(open && !data)
  const current = me?.repo

  async function switchTo(r: RepoInfo) {
    if (r.owner === current?.owner && r.name === current?.name) return setOpen(false)
    setSwitching(r.fullName)
    await api('/repo', { method: 'POST', json: { owner: r.owner, name: r.name } })
    window.location.href = '/'
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <span className="max-w-[12rem] truncate sm:max-w-none">{current?.owner}/{current?.name}</span>
          <span className="hidden opacity-50 sm:inline">· {current?.branch}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 w-72 overflow-y-auto">
        <DropdownMenuLabel className="font-normal text-muted-foreground">Sites</DropdownMenuLabel>
        {showSkeleton &&
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        {data?.repos.map((r) => {
          const active = r.owner === current?.owner && r.name === current?.name
          return (
            <DropdownMenuItem key={r.fullName} onSelect={(e) => { e.preventDefault(); switchTo(r) }} disabled={!!switching}>
              <Check className={cn('size-4', !active && 'opacity-0')} />
              <span className="truncate">{r.fullName}</span>
              {switching === r.fullName && <span className="ml-auto text-xs text-muted-foreground">Switching…</span>}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <NavLink to="/connect"><Plus /> Connect another site</NavLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { config } = useConfig()
  const item = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent',
      isActive ? 'bg-sidebar-accent font-medium' : 'text-sidebar-foreground/80',
    )

  return (
    <nav className="space-y-4 p-3" onClick={onNavigate}>
      <NavLink to="/" end className={item}><LayoutDashboard className="size-4" /> Dashboard</NavLink>

      <div>
        <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Content</div>
        {config?.collections.map((c) => (
          <NavLink key={c.name} to={`/content/${c.name}`} className={item}>
            <FileText className="size-4" /> {c.label}
          </NavLink>
        ))}
        {!config && <div className="px-2 py-1 text-xs text-muted-foreground">No collections</div>}
      </div>

      <div className="space-y-0.5">
        <NavLink to="/media" className={item}><Image className="size-4" /> Media</NavLink>
        <NavLink to="/settings" className={item}><Settings className="size-4" /> Settings</NavLink>
      </div>
    </nav>
  )
}
