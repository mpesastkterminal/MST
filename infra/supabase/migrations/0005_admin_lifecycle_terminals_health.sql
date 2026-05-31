-- MST Phase 5: admin lifecycle, terminal tracking, and operations visibility.

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'businesses'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table businesses drop constraint %I', constraint_name);
  end if;
end $$;

alter table businesses
  add column if not exists archived_at timestamptz null,
  add constraint businesses_status_check
  check (status in ('active', 'suspended', 'archived'));

update branches
set status = 'suspended'
where status = 'inactive';

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'branches'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table branches drop constraint %I', constraint_name);
  end if;
end $$;

alter table branches
  add column if not exists archived_at timestamptz null,
  add constraint branches_status_check
  check (status in ('active', 'suspended', 'archived'));

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'app_users'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table app_users drop constraint %I', constraint_name);
  end if;
end $$;

alter table app_users
  add column if not exists must_change_password boolean not null default false,
  add column if not exists last_login_at timestamptz null,
  add column if not exists last_activity_at timestamptz null,
  add constraint app_users_status_check
  check (status in ('invited', 'active', 'suspended', 'disabled'));

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'business_memberships'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table business_memberships drop constraint %I', constraint_name);
  end if;
end $$;

alter table business_memberships
  add constraint business_memberships_status_check
  check (status in ('invited', 'active', 'suspended', 'disabled'));

create table if not exists terminals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  device_id text not null,
  terminal_name text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references branches(business_id, id),
  unique (business_id, branch_id, device_id)
);

alter table app_sessions
  add column if not exists terminal_id uuid null references terminals(id),
  add column if not exists last_activity_at timestamptz null;

alter table stk_push_requests
  add column if not exists device_id text null,
  add column if not exists terminal_id uuid null references terminals(id);

create index if not exists idx_businesses_status_created
  on businesses (status, created_at desc);

create index if not exists idx_branches_business_status
  on branches (business_id, status, created_at desc);

create index if not exists idx_app_users_status
  on app_users (status, created_at desc);

create index if not exists idx_app_sessions_business_user_status
  on app_sessions (business_id, user_id, status, created_at desc);

create index if not exists idx_app_sessions_business_terminal_status
  on app_sessions (business_id, terminal_id, status);

create index if not exists idx_terminals_business_branch_status
  on terminals (business_id, branch_id, status);

create index if not exists idx_terminals_business_device
  on terminals (business_id, device_id);

create index if not exists idx_stk_push_requests_business_terminal_created
  on stk_push_requests (business_id, terminal_id, created_at desc);

alter table terminals enable row level security;
alter table terminals force row level security;

create policy terminals_tenant_select on terminals
  for select using (
    mst.can_access_business(business_id)
    and mst.can_access_branch(business_id, branch_id)
  );

create policy terminals_service_insert on terminals
  for insert with check (mst.is_service_context() or mst.is_super_admin());

create policy terminals_service_update on terminals
  for update using (mst.is_service_context() or mst.is_super_admin())
  with check (mst.is_service_context() or mst.is_super_admin());
