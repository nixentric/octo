import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { FileText, Image, LayoutDashboard, LogOut, Menu, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logout, useSession } from '@/features/auth/session'
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
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
          <Menu />
        </Button>
        <NavLink to="/" className="font-semibold tracking-tight">Octo</NavLink>
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {me?.repo?.owner}/{me?.repo?.name} <span className="mx-1 opacity-50">·</span> {me?.repo?.branch}
        </span>
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
        {open && <div className="fixed inset-0 z-10 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}
        <aside
          className={cn(
            'fixed inset-y-12 left-0 z-20 w-56 shrink-0 overflow-y-auto border-r bg-sidebar transition-transform md:static md:translate-x-0',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <Sidebar onNavigate={() => setOpen(false)} />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
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
