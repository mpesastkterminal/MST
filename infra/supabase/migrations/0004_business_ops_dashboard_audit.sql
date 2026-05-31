-- MST Phase 4: dashboard preferences, reporting indexes, and append-only audit enforcement.

create table if not exists dashboard_widget_preferences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  widgets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists idx_dashboard_widget_preferences_business_user
  on dashboard_widget_preferences (business_id, user_id);

create index if not exists idx_stk_push_requests_business_status_created
  on stk_push_requests (business_id, status, created_at desc);

create index if not exists idx_stk_push_requests_business_branch_status_created
  on stk_push_requests (business_id, branch_id, status, created_at desc);

create index if not exists idx_stk_push_requests_business_session_created
  on stk_push_requests (business_id, session_id, created_at desc);

create index if not exists idx_stk_push_requests_requested_by_created
  on stk_push_requests (business_id, requested_by_user_id, created_at desc);

alter table dashboard_widget_preferences enable row level security;
alter table dashboard_widget_preferences force row level security;

create policy dashboard_widget_preferences_tenant_select
  on dashboard_widget_preferences
  for select using (
    user_id = auth.uid()
    and mst.can_access_business(business_id)
  );

create policy dashboard_widget_preferences_tenant_insert
  on dashboard_widget_preferences
  for insert with check (
    user_id = auth.uid()
    and mst.can_access_business(business_id)
  );

create policy dashboard_widget_preferences_tenant_update
  on dashboard_widget_preferences
  for update using (
    user_id = auth.uid()
    and mst.can_access_business(business_id)
  )
  with check (
    user_id = auth.uid()
    and mst.can_access_business(business_id)
  );

create or replace function mst.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs are append-only';
end;
$$;

drop trigger if exists trg_audit_logs_append_only_update on audit_logs;
create trigger trg_audit_logs_append_only_update
  before update on audit_logs
  for each row execute function mst.prevent_audit_log_mutation();

drop trigger if exists trg_audit_logs_append_only_delete on audit_logs;
create trigger trg_audit_logs_append_only_delete
  before delete on audit_logs
  for each row execute function mst.prevent_audit_log_mutation();
