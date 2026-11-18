import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from '@/layouts/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import { LauncherPage } from '@/features/home/LauncherPage';
import { RequireAuth, RequireCapability } from './RequireAuth';
import { RouteError } from './ErrorBoundary';

/** Feature pages load on demand (route-level code splitting); each module exports a named component. */
const lazyPage = (load: () => Promise<{ Page: React.ComponentType }>, capability?: string): RouteObject['lazy'] =>
  async () => {
    const { Page } = await load();
    return { Component: capability ? () => <RequireCapability code={capability}><Page /></RequireCapability> : Page };
  };

const routes: RouteObject[] = [
  { path: '/sign-in', element: <LoginPage />, errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <LauncherPage /> },
          { path: 'explorer', lazy: lazyPage(() => import('@/features/explorer/ExplorerPage').then((m) => ({ Page: m.ExplorerPage })), 'cabinets:read') },
          { path: 'documents/:id', lazy: lazyPage(() => import('@/features/documents/DocumentPage').then((m) => ({ Page: m.DocumentPage })), 'documents:read') },
          { path: 'search', lazy: lazyPage(() => import('@/features/search/SearchPage').then((m) => ({ Page: m.SearchPage })), 'documents:read') },
          { path: 'tasks', lazy: lazyPage(() => import('@/features/tasks/TasksPage').then((m) => ({ Page: m.TasksPage })), 'workflows:participate') },
          { path: 'notifications', lazy: lazyPage(() => import('@/features/notifications/NotificationsPage').then((m) => ({ Page: m.NotificationsPage }))) },
          { path: 'admin/users', lazy: lazyPage(() => import('@/features/admin/UsersPage').then((m) => ({ Page: m.UsersPage })), 'users:read') },
          { path: 'admin/document-types', lazy: lazyPage(() => import('@/features/admin/DocumentTypesPage').then((m) => ({ Page: m.DocumentTypesPage })), 'document_types:manage') },
          { path: 'admin/workflows', lazy: lazyPage(() => import('@/features/admin/WorkflowsAdminPage').then((m) => ({ Page: m.WorkflowsAdminPage })), 'workflows:manage') },
          { path: 'admin/retention', lazy: lazyPage(() => import('@/features/admin/RetentionPage').then((m) => ({ Page: m.RetentionPage })), 'retention:manage') },
          { path: 'admin/legal-holds', lazy: lazyPage(() => import('@/features/admin/LegalHoldsPage').then((m) => ({ Page: m.LegalHoldsPage })), 'legal_holds:manage') },
          { path: '*', lazy: lazyPage(() => import('./NotFoundPage').then((m) => ({ Page: m.NotFoundPage }))) },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
