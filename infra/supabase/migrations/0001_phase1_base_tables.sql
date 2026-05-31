-- MST base tables.
-- Phase 2 adds tenant membership, sessions, RLS, and security policies in the
-- next migration.

create extension if not exists pgcrypto;

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  code text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, code)
);

create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create table if not exists stk_push_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  requested_by_user_id uuid null,
  amount numeric(12, 2) not null check (amount > 0),
  phone_number text not null,
  account_reference text null,
  description text null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'success', 'failed')),
  merchant_request_id text null,
  checkout_request_id text null,
  idempotency_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references branches(business_id, id),
  foreign key (requested_by_user_id) references app_users(id),
  unique (business_id, branch_id, idempotency_key)
);

create index if not exists idx_branches_business_id
  on branches (business_id);

create index if not exists idx_stk_push_requests_business_branch_created
  on stk_push_requests (business_id, branch_id, created_at desc);
