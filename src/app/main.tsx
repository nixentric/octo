import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route, RouterProvider } from 'react-router'
import './index.css'
import { ConfirmProvider } from '@/components/confirm'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth, RequireRepo, SessionProvider } from '@/features/auth/session'
import { CollectionPage } from '@/features/collections/CollectionPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { EditorPage } from '@/features/editor/EditorPage'
import { MediaPage } from '@/features/media/MediaPage'
import { ConnectRepoPage } from '@/features/settings/ConnectRepoPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<ConfirmProvider><SessionProvider><Outlet /></SessionProvider></ConfirmProvider>}>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/connect" element={<ConnectRepoPage />} />
        <Route element={<RequireRepo />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="content/:collection" element={<CollectionPage />} />
            <Route path="content/:collection/new" element={<EditorPage />} />
            <Route path="content/:collection/edit/*" element={<EditorPage />} />
            <Route path="media" element={<MediaPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
