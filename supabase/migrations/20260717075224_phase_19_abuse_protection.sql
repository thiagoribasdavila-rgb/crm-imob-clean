begin;

create table if not exists public.api_rate_limit_buckets (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  primary key (scope, key_hash, window_started_at)
);

alter table public.api_rate_limit_buckets enable row level security;
revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;
create index if not exists idx_api_rate_limit_expiry on public.api_rate_limit_buckets (expires_at);
create unique index if not exists uq_messages_external_delivery
  on public.messages (organization_id, channel, external_message_id)
  where external_message_id is not null;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window timestamptz;
  v_count integer;
begin
  if p_scope !~ '^[a-zA-Z0-9._:-]{2,100}$'
    or p_key_hash !~ '^[a-f0-9]{64}$'
    or p_limit not between 1 and 10000
    or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit parameters';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  delete from public.api_rate_limit_buckets
  where scope = p_scope and key_hash = p_key_hash and expires_at < v_now;

  insert into public.api_rate_limit_buckets (
    scope, key_hash, window_started_at, request_count, expires_at
  ) values (
    p_scope, p_key_hash, v_window, 1, v_window + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (scope, key_hash, window_started_at)
  do update set request_count = public.api_rate_limit_buckets.request_count + 1
  returning request_count into v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_window + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;

create or replace function public.claim_api_idempotency(
  p_organization_id uuid,
  p_scope text,
  p_key text,
  p_request_hash text,
  p_lock_seconds integer default 60
)
returns table (state text, response_status integer, response_body jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.idempotency_keys%rowtype;
begin
  if p_scope !~ '^[a-zA-Z0-9._:-]{2,100}$'
    or p_key !~ '^[A-Za-z0-9._:-]{8,128}$'
    or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_lock_seconds not between 5 and 300 then
    raise exception 'invalid idempotency parameters';
  end if;

  delete from public.idempotency_keys
  where organization_id = p_organization_id
    and scope = p_scope
    and key = p_key
    and expires_at < clock_timestamp();

  insert into public.idempotency_keys (
    organization_id, key, scope, request_hash, locked_until, expires_at
  ) values (
    p_organization_id, p_key, p_scope, p_request_hash,
    clock_timestamp() + make_interval(secs => p_lock_seconds),
    clock_timestamp() + interval '24 hours'
  ) on conflict (organization_id, scope, key) do nothing;

  select * into v_row from public.idempotency_keys
  where organization_id = p_organization_id and scope = p_scope and key = p_key
  for update;

  if v_row.request_hash is distinct from p_request_hash then
    return query select 'conflict'::text, null::integer, null::jsonb;
  elsif v_row.response_status is not null then
    return query select 'replay'::text, v_row.response_status, v_row.response_body;
  elsif v_row.locked_until < clock_timestamp() then
    update public.idempotency_keys set
      locked_until = clock_timestamp() + make_interval(secs => p_lock_seconds),
      updated_at = clock_timestamp()
    where id = v_row.id;
    return query select 'claimed'::text, null::integer, null::jsonb;
  elsif v_row.created_at = v_row.updated_at then
    update public.idempotency_keys set updated_at = clock_timestamp() where id = v_row.id;
    return query select 'claimed'::text, null::integer, null::jsonb;
  else
    return query select 'processing'::text, null::integer, null::jsonb;
  end if;
end;
$$;

create or replace function public.complete_api_idempotency(
  p_organization_id uuid,
  p_scope text,
  p_key text,
  p_request_hash text,
  p_response_status integer,
  p_response_body jsonb
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.idempotency_keys set
    response_status = p_response_status,
    response_body = p_response_body,
    locked_until = null,
    updated_at = clock_timestamp()
  where organization_id = p_organization_id
    and scope = p_scope
    and key = p_key
    and request_hash = p_request_hash
    and response_status is null
  returning true;
$$;

revoke all on function public.claim_api_idempotency(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.complete_api_idempotency(uuid, text, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.claim_api_idempotency(uuid, text, text, text, integer) to service_role;
grant execute on function public.complete_api_idempotency(uuid, text, text, text, integer, jsonb) to service_role;

commit;
