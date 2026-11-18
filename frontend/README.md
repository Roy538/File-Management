# ManageEDocs Frontend

React 19 + TypeScript (strict) single-page app for the Spring Boot `/api/v1` backend in `../backend`.
It replaces `../apps/web` (which talks to the legacy NestJS API) at cutover (ADR-002).

## Stack

| Concern | Choice |
|---|---|
| Build | Vite 7, TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`) |
| Routing | React Router 7, route-level code splitting (`lazy`) |
| Server state | TanStack Query 5 (all server data) |
| Client state | Zustand (session, upload dialog), nothing else |
| Forms | React Hook Form + Zod |
| UI | Tailwind CSS 4 with design tokens in `src/styles/index.css`; Radix Dialog/Dropdown for accessible overlays; lucide icons; sonner toasts |
| Fonts | Public Sans (UI) and Source Serif 4 (document titles), self-hosted via Fontsource, so there are no third-party font requests |
| Tests | Vitest + Testing Library |

## Design: "the registry"

The navy brand, top bar (Upload, document search, alerts, user), accordion sidebar with quick-action tiles, grouped launcher panels, and the cabinet → folder → sub-divider explorer follow the owner's reference screens (`../Images`). One device is distinctive: the **manila folder tab** (`TabbedPanel`, `.file-tab`). It marks real containers only (launcher groups, cabinets, folders). Tables are used rather than card grids, with 14px UI type, sentence-case labels and serif document titles.

## Structure

```
src/
├── app/            router (lazy routes), RequireAuth/RequireCapability, error boundary, 404
├── layouts/        AppShell: top bar, sidebar, drawer on mobile, global upload dialog
├── components/ui/  Button, Field/Input/Select/Textarea, Dialog, Menu, States (Spinner/Skeleton/Empty/Error),
│                   StatusBadge, TabbedPanel, PageHeader, Pagination, FileIcon
├── features/       auth, home (launcher), explorer, documents, search, tasks, notifications, admin
├── lib/api/        client.ts (the only HTTP client) and types.ts (mirrors backend DTOs)
└── styles/         tokens + base styles
```

## Security model in the client

- The **access token lives only in memory** inside `lib/api/client.ts`, never in `localStorage`. The refresh token is an `HttpOnly; SameSite=Strict` cookie scoped to `/api/v1/auth`. On page load the app silently refreshes. On a 401 it performs one shared refresh and retries once; if that fails, the user is returned to sign-in with an explanation.
- Capabilities from `/auth/me` (`user.permissions`) and per-object `rights` from the API **only hide or disable UI**. The server enforces every one of them.
- No document content is ever injected as HTML. Search highlights use offsets.
- The query cache is cleared on sign-out, so the next user never sees the previous user's data.

## Develop

```bash
# backend + MySQL + MinIO running (see ../backend/README.md), then:
npm install
npm run dev            # http://localhost:5174, proxies /api to http://localhost:8080 (override with API_URL)
python scripts/seed-demo.py   # optional: demo cabinets, folders, real PDFs, users, an open review (fresh dev DB only)
```

On this machine the nvm shim breaks `node`/`npm` inside the repo (`.nvmrc` asks for Node 20). Call Node 22 directly:
`"…/nvm/installs/v22.23.3/node.exe" node_modules/vite/bin/vite.js`.

## Quality gates

```bash
npm run typecheck   # tsc strict
npm test            # vitest
npm run build       # production bundle (route-split)
```
