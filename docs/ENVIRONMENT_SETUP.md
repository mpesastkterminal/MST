# MST Environment Setup

MST is a shared monorepo. Railway should deploy the API service only; the web and desktop apps stay in the repo for local development and packaging.

Phase 5 does not introduce additional environment variables. It does add admin-provisioned user accounts, terminal registration, session/device revocation, and operations health endpoints on top of the same API, web, desktop, Supabase, and Daraja configuration.

## API Variables

`NODE_ENV`

- Purpose: runtime mode used for production safety checks.
- Example: `development`
- Local: optional, normally `development`.
- Production: required; set to `production`.

`PORT`

- Purpose: Express HTTP port.
- Example: `4000`
- Local: optional, defaults to `4000`.
- Production: Railway provides `PORT`; do not hardcode it.

`WEB_ORIGIN`

- Purpose: comma-separated browser origins allowed to call the API.
- Example: `http://localhost:3000,https://mst.up.railway.app`
- Local: required when running `apps/web`; `http://localhost:3000` is always allowed by the API.
- Production: set to the deployed renderer origin if hosted.

`SUPABASE_URL`

- Purpose: Supabase project URL for auth and database calls.
- Example: `https://abcxyz.supabase.co`
- Local: required.
- Production: required.

`SUPABASE_ANON_KEY`

- Purpose: validates user-scoped Supabase requests.
- Example: Supabase anon JWT from project settings.
- Local: required.
- Production: required.

`SUPABASE_SERVICE_ROLE_KEY`

- Purpose: backend-only service key for server-side writes after API permission checks.
- Example: Supabase service role JWT from project settings.
- Local: required for onboarding, lifecycle, sessions, terminals, dashboard, reporting, audit, credentials, and STK.
- Production: required. Never expose this in web or desktop builds.

`MST_CREDENTIAL_ENCRYPTION_KEY`

- Purpose: AES-256-GCM key for M-Pesa credential encryption.
- Example: `base64:<32-byte-base64-value>`
- Local: required before saving M-Pesa credentials.
- Production: required and must remain stable across deployments.

Generate it with:

```bash
node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"
```

`MST_API_PUBLIC_URL`

- Purpose: public HTTPS API URL used in Daraja STK callback URLs.
- Example: `https://mst-api.up.railway.app`
- Local: required for real Daraja callback testing; use an HTTPS tunnel.
- Production: required and must be reachable by Safaricom.

## Web Variables

`NEXT_PUBLIC_API_URL`

- Purpose: API base URL used by the Next.js renderer.
- Example: `https://mst-api.up.railway.app`
- Local: required. Use `http://localhost:4000` for a local API, or your Railway API URL when the API is deployed but the renderer is running locally.
- Production: set to the Railway API public URL.

`NEXT_PUBLIC_SUPABASE_URL`

- Purpose: Supabase URL used by browser auth.
- Example: `https://abcxyz.supabase.co`
- Local: required.
- Production: required.

`NEXT_PUBLIC_SUPABASE_ANON_KEY`

- Purpose: Supabase anon key used by browser auth.
- Example: Supabase anon JWT from project settings.
- Local: required.
- Production: required. This is public; never use the service role key here.

## Desktop Variables

`MST_WEB_URL`

- Purpose: URL loaded by the Electron shell.
- Example: `http://localhost:3000`
- Local: required when running the desktop shell against the web dev server.
- Production: set to the packaged or hosted renderer URL for the release channel.
- Important: this is not the Railway API URL. Railway deploys `apps/api`; Electron still needs a Next.js renderer from local `npm run dev` or a separately hosted web renderer.

## Railway Deployment Checklist

1. Create one Railway service for the API.
2. Keep the service root at the repository root because `apps/api` depends on `packages/shared`.
3. Set the install command to install only the API and shared workspaces:

```bash
npm ci --workspace @mst/api --workspace @mst/shared --include-workspace-root=false
```

4. Set the build command:

```bash
npm run build:api
```

5. Set the start command:

```bash
npm run start:api
```

6. Add API variables from `apps/api/.env.example`.
7. Set `MST_API_PUBLIC_URL` to the Railway public HTTPS domain.
8. Do not install or run Electron on Railway.

Railway's monorepo docs describe root-directory and shared-monorepo deployment options: https://docs.railway.com/deployments/monorepo

## Supabase Setup Checklist

1. Create a Supabase project.
2. Apply migrations in order from `infra/supabase/migrations`.
3. Enable Supabase Auth email/password.
4. Copy `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
5. Seed a super admin `auth.users` record and matching `app_users` row.
6. Create an initial admin business and `business_memberships` row with `role_key = 'super_admin'`.
7. Confirm RLS is enabled and forced on tenant tables.
8. Confirm `audit_logs` update/delete attempts fail.
9. Do not enable public registration in the MST UI. Accounts are created through backend admin provisioning.
10. Confirm `terminals` RLS is enabled after migration `0005`.

Supabase RLS documentation: https://supabase.com/docs/guides/database/postgres/row-level-security

## Daraja Setup Checklist

1. Create a Safaricom Developer account.
2. Create or configure a Daraja app.
3. Obtain shortcode, passkey, consumer key, and consumer secret.
4. In MST, save credentials per branch and environment.
5. Ensure `MST_API_PUBLIC_URL` is an HTTPS URL reachable from Safaricom.
6. Use sandbox credentials first.
7. Confirm callbacks arrive at `/mpesa/callback/stk/:requestId/:callbackToken`.

Safaricom developer portal: https://developer.safaricom.co.ke/

## Local Development Checklist

1. Run `npm install`.
2. Copy `.env.example` into app-specific `.env` files or export values in your shell.
   For Electron local development, create `apps/web/.env.local` with `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Apply Supabase migrations.
4. Seed a super admin, then use the API to create businesses and provision users with temporary passwords.
5. Create at least one active branch and save active M-Pesa credentials for that branch.
6. When launching Electron, enter a terminal name such as `Counter 1`, `Counter 2`, `Front Desk`, or `Pharmacy Counter`.
7. Start API:

```bash
npm run dev:api
```

8. Start web:

```bash
npm run dev:web
```

9. Start desktop:

```bash
npm run dev:desktop
```

For the normal desktop development path, run this single command from the repository root:

```bash
npm run dev
```

This starts the local Next.js renderer and then launches Electron. To use a Railway API backend, set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` to the Railway API URL; do not set `MST_WEB_URL` to the API URL.
