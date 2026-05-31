# MST

MST (M-Pesa STK Terminal) is a multi-tenant SaaS foundation for managing M-Pesa STK operations across businesses and branches.

This repository is currently in Phase 2: security, authentication, and tenant isolation foundation.

## Workspaces

- `apps/api` - Express API server
- `apps/web` - Next.js renderer UI
- `apps/desktop` - Electron shell
- `packages/shared` - shared TypeScript types
- `infra/supabase` - Supabase migrations

## Phase 1 Commands

```bash
npm install
npm run dev:api
npm run dev:web
npm run dev:desktop
```

## Required Environment

Copy `.env.example` into the environment used by each app. The API requires:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MST_CREDENTIAL_ENCRYPTION_KEY`

The web app requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`

## Current Security Boundary

The backend validates Supabase bearer tokens, resolves the active business from `business_memberships`, requires `x-mst-device-id` and `x-mst-session-id` for protected API calls, and enforces permissions server-side.
