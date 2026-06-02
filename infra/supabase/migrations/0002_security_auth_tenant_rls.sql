-- MST Phase 2: authentication, session tracking, tenant memberships, and RLS.

create schema if not exists mst;

create table if not exists business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  branch_id uuid null,
  role_key text not null check (
    role_key in ('super_admin', 'business_owner', 'branch_manager', 'cashier')
  ),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id),
  foreign key (business_id, branch_id) references branches(business_id, id)
);

create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid null,
  device_id text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  refresh_token_hash text null,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references branches(business_id, id)
);

alter table stk_push_requests
  add column if not exists session_id uuid null references app_sessions(id);

create table if not exists transaction_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  stk_request_id uuid null references stk_push_requests(id) on delete set null,
  amount numeric(12, 2) null,
  phone_number text null,
  mpesa_receipt_number text null,
  result_code text null,
  result_description text null,
  transaction_date timestamptz null,
  raw_callback_redacted jsonb null,
  created_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references branches(business_id, id)
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid null,
  actor_user_id uuid null references app_users(id) on delete set null,
  session_id uuid null references app_sessions(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  ip_address inet null,
  user_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references branches(business_id, id)
);

create table if not exists mpesa_credentials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  environment text not null check (environment in ('sandbox', 'production')),
  shortcode text not null,
  encrypted_passkey text not null,
  encrypted_consumer_key text not null,
  encrypted_consumer_secret text not null,
  is_active boolean not null default true,
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references branches(business_id, id)
);

create unique index if not exists idx_mpesa_credentials_one_active
  on mpesa_credentials (business_id, branch_id, environment)
  where is_active;

create index if not exists idx_business_memberships_user
  on business_memberships (user_id, status);

create index if not exists idx_business_memberships_business
  on business_memberships (business_id, status);

create index if not exists idx_app_sessions_user_business_device
  on app_sessions (user_id, business_id, device_id, status);

create index if not exists idx_transaction_logs_business_branch_created
  on transaction_logs (business_id, branch_id, created_at desc);

create index if not exists idx_audit_logs_business_created
  on audit_logs (business_id, created_at desc);

create or replace function mst.jwt_business_id()
returns uuid
language sql
stable
as $$
  select case
    when auth.jwt() ? 'business_id'
      then nullif(auth.jwt() ->> 'business_id', '')::uuid
    else null
  end;
$$;

create or replace function mst.is_service_context()
returns boolean
language sql
stable
as $$
  select auth.role() = 'service_role';
$$;

create or replace function mst.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, mst
as $$
  select exists (
    select 1
    from app_users
    where id = auth.uid()
      and is_super_admin = true
      and status = 'active'
  );
$$;

create or replace function mst.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, mst
as $$
  select exists (
    select 1
    from business_memberships
    where user_id = auth.uid()
      and business_id = target_business_id
      and status = 'active'
  );
$$;

create or replace function mst.can_access_branch(
  target_business_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, mst
as $$
  select exists (
    select 1
    from business_memberships
    where user_id = auth.uid()
      and business_id = target_business_id
      and status = 'active'
      and (branch_id is null or branch_id = target_branch_id)
  );
$$;

create or replace function mst.shares_business_with_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, mst
as $$
  select exists (
    select 1
    from business_memberships actor_membership
    join business_memberships target_membership
      on target_membership.business_id = actor_membership.business_id
    where actor_membership.user_id = auth.uid()
      and actor_membership.status = 'active'
      and target_membership.user_id = target_user_id
      and target_membership.status = 'active'
  );
$$;

create or replace function mst.can_access_business(target_business_id uuid)
returns boolean
language sql
stable
as $$
  select mst.is_service_context()
    or mst.is_super_admin()
    or mst.jwt_business_id() = target_business_id
    or mst.is_business_member(target_business_id);
$$;

alter table businesses enable row level security;
alter table branches enable row level security;
alter table app_users enable row level security;
alter table business_memberships enable row level security;
alter table app_sessions enable row level security;
alter table stk_push_requests enable row level security;
alter table transaction_logs enable row level security;
alter table audit_logs enable row level security;
alter table mpesa_credentials enable row level security;

alter table businesses force row level security;
alter table branches force row level security;
alter table app_users force row level security;
alter table business_memberships force row level security;
alter table app_sessions force row level security;
alter table stk_push_requests force row level security;
alter table transaction_logs force row level security;
alter table audit_logs force row level security;
alter table mpesa_credentials force row level security;

create policy businesses_tenant_select on businesses
  for select using (mst.can_access_business(id));

create policy branches_tenant_select on branches
  for select using (
    mst.can_access_business(business_id)
    and mst.can_access_branch(business_id, id)
  );

create policy branches_service_insert on branches
  for insert with check (mst.is_service_context() or mst.is_super_admin());

create policy branches_service_update on branches
  for update using (mst.is_service_context() or mst.is_super_admin())
  with check (mst.is_service_context() or mst.is_super_admin());

create policy app_users_self_or_same_business_select on app_users
  for select using (
    mst.is_service_context()
    or mst.is_super_admin()
    or id = auth.uid()
    or mst.shares_business_with_user(id)
  );

create policy app_users_service_update on app_users
  for update using (mst.is_service_context() or mst.is_super_admin())
  with check (mst.is_service_context() or mst.is_super_admin());

create policy business_memberships_tenant_select on business_memberships
  for select using (
    mst.can_access_business(business_id)
    or user_id = auth.uid()
  );

create policy business_memberships_service_insert on business_memberships
  for insert with check (mst.is_service_context() or mst.is_super_admin());

create policy business_memberships_service_update on business_memberships
  for update using (mst.is_service_context() or mst.is_super_admin())
  with check (mst.is_service_context() or mst.is_super_admin());

create policy app_sessions_tenant_select on app_sessions
  for select using (
    user_id = auth.uid()
    and mst.can_access_business(business_id)
  );

create policy app_sessions_tenant_insert on app_sessions
  for insert with check (
    user_id = auth.uid()
    and mst.can_access_business(business_id)
    and (branch_id is null or mst.can_access_branch(business_id, branch_id))
  );

create policy app_sessions_tenant_update on app_sessions
  for update using (
    user_id = auth.uid()
    and mst.can_access_business(business_id)
  )
  with check (
    user_id = auth.uid()
    and mst.can_access_business(business_id)
  );

create policy stk_push_requests_tenant_select on stk_push_requests
  for select using (
    mst.can_access_business(business_id)
    and mst.can_access_branch(business_id, branch_id)
  );

create policy stk_push_requests_service_insert on stk_push_requests
  for insert with check (mst.is_service_context() or mst.is_super_admin());

create policy stk_push_requests_service_update on stk_push_requests
  for update using (mst.is_service_context() or mst.is_super_admin())
  with check (mst.is_service_context() or mst.is_super_admin());

create policy transaction_logs_tenant_select on transaction_logs
  for select using (
    mst.can_access_business(business_id)
    and mst.can_access_branch(business_id, branch_id)
  );

create policy transaction_logs_service_insert on transaction_logs
  for insert with check (mst.is_service_context() or mst.is_super_admin());

create policy audit_logs_tenant_select on audit_logs
  for select using (mst.can_access_business(business_id));

create policy audit_logs_service_insert on audit_logs
  for insert with check (mst.is_service_context() or mst.is_super_admin());

create policy mpesa_credentials_service_only_select on mpesa_credentials
  for select using (mst.is_service_context() or mst.is_super_admin());

create policy mpesa_credentials_service_only_write on mpesa_credentials
  for all using (mst.is_service_context() or mst.is_super_admin())
  with check (mst.is_service_context() or mst.is_super_admin());

grant usage on schema mst to anon, authenticated, service_role;
grant execute on all functions in schema mst to anon, authenticated, service_role;

alter default privileges in schema mst
  grant execute on functions to anon, authenticated, service_role;
