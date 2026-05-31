# MST

MST (M-Pesa STK Terminal) is a multi-tenant SaaS foundation for managing M-Pesa STK operations across businesses and branches.

The repository is currently scaffolded through Phase 5: secure tenant core, M-Pesa STK engine foundation, business operations, admin lifecycle workflows, terminal tracking, session/device management, operations health, reporting, audit logging, and deployment preparation.

## Workspaces

- `apps/api` - Express API server deployed to Railway
- `apps/web` - Next.js renderer UI
- `apps/desktop` - Electron shell
- `packages/shared` - shared TypeScript types
- `infra/supabase` - Supabase migrations
- `docs` - setup and deployment notes

## Local Commands

```bash
npm install
npm run dev:api
npm run dev:web
npm run dev:desktop
```

## Verification

```bash
npm run typecheck
npm run build
npm run build:api
```

`npm run build:api` is the Railway deployment build path for the API-only service.

## Environment Setup

Use the app-specific examples:

- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/desktop/.env.example`

See `docs/ENVIRONMENT_SETUP.md` for the full Railway, Supabase, Daraja, and local development checklists.

## Security Boundary

The backend validates Supabase bearer tokens, resolves tenant membership server-side, requires MST session and device headers for protected calls, and enforces permissions and transaction visibility in API routes. `business_id` is derived from authenticated membership and remains the root tenant boundary.

There is no public registration flow. Users are provisioned by authorized administrators with temporary passwords and a `must_change_password` profile flag.
