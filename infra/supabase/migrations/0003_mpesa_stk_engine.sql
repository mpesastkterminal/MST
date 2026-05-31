-- MST Phase 3: M-Pesa STK engine transaction metadata and idempotent callbacks.

do $$
declare
  status_constraint_name text;
begin
  select conname
    into status_constraint_name
  from pg_constraint
  where conrelid = 'stk_push_requests'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
  limit 1;

  if status_constraint_name is not null then
    execute format(
      'alter table stk_push_requests drop constraint %I',
      status_constraint_name
    );
  end if;
end $$;

alter table stk_push_requests
  add constraint stk_push_requests_status_check
  check (status in ('pending', 'processing', 'success', 'failed', 'reversed'));

alter table stk_push_requests
  add column if not exists credential_id uuid null references mpesa_credentials(id),
  add column if not exists transaction_type text not null default 'CustomerPayBillOnline',
  add column if not exists callback_token_hash text null,
  add column if not exists callback_url text null,
  add column if not exists daraja_request_attempts integer not null default 0,
  add column if not exists daraja_requested_at timestamptz null,
  add column if not exists daraja_accepted_at timestamptz null,
  add column if not exists callback_received_at timestamptz null,
  add column if not exists completed_at timestamptz null,
  add column if not exists failed_at timestamptz null,
  add column if not exists response_code text null,
  add column if not exists response_description text null,
  add column if not exists customer_message text null,
  add column if not exists result_code text null,
  add column if not exists result_description text null,
  add column if not exists mpesa_receipt_number text null,
  add column if not exists transaction_date timestamptz null,
  add column if not exists daraja_request_payload_redacted jsonb null,
  add column if not exists daraja_response_payload_redacted jsonb null,
  add column if not exists callback_metadata_redacted jsonb null,
  add column if not exists last_error_code text null,
  add column if not exists last_error_message text null;

alter table mpesa_credentials
  add column if not exists transaction_type text not null default 'CustomerPayBillOnline'
  check (transaction_type in ('CustomerPayBillOnline', 'CustomerBuyGoodsOnline'));

alter table transaction_logs
  add column if not exists callback_fingerprint text null,
  add column if not exists checkout_request_id text null,
  add column if not exists merchant_request_id text null,
  add column if not exists status_from text null,
  add column if not exists status_to text null,
  add column if not exists event_type text not null default 'stk_callback';

create unique index if not exists idx_stk_push_requests_checkout_request_id
  on stk_push_requests (checkout_request_id)
  where checkout_request_id is not null;

create unique index if not exists idx_stk_push_requests_business_branch_idempotency
  on stk_push_requests (business_id, branch_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_stk_push_requests_status_created
  on stk_push_requests (business_id, branch_id, status, created_at desc);

create index if not exists idx_stk_push_requests_session_created
  on stk_push_requests (business_id, session_id, created_at desc);

create unique index if not exists idx_transaction_logs_callback_fingerprint
  on transaction_logs (business_id, callback_fingerprint)
  where callback_fingerprint is not null;

create index if not exists idx_transaction_logs_checkout_request_id
  on transaction_logs (business_id, checkout_request_id);
