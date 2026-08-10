-- Phase 372: append-only evidence ledger for the future authenticated director
-- decision flow. This migration creates the persistence boundary only. It does
-- not approve memory, activate learning or expose a client-callable function.

create table if not exists public.whatsapp_memory_director_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approve', 'reject')),
  reason text not null check (char_length(trim(reason)) between 20 and 1000),
  operational_scope_confirmed boolean not null check (operational_scope_confirmed is true),
  evidence_limits_confirmed boolean not null check (evidence_limits_confirmed is true),
  evidence_measured_at timestamptz not null,
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index if not exists whatsapp_memory_director_decisions_tenant_created_idx
  on public.whatsapp_memory_director_decisions (organization_id, created_at desc);

alter table public.whatsapp_memory_director_decisions enable row level security;
alter table public.whatsapp_memory_director_decisions force row level security;

drop policy if exists whatsapp_memory_director_decisions_director_read
  on public.whatsapp_memory_director_decisions;
create policy whatsapp_memory_director_decisions_director_read
  on public.whatsapp_memory_director_decisions
  for select
  to authenticated
  using (
    organization_id = (select public.current_organization_id())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.organization_id = whatsapp_memory_director_decisions.organization_id
        and p.active is true
        and coalesce(
          p.commercial_role,
          case when p.role = 'admin' then 'director' else p.role end
        ) = 'director'
    )
  );

revoke all on table public.whatsapp_memory_director_decisions from public;
revoke all on table public.whatsapp_memory_director_decisions from anon;
revoke all on table public.whatsapp_memory_director_decisions from authenticated;
grant select on table public.whatsapp_memory_director_decisions to authenticated;
grant all on table public.whatsapp_memory_director_decisions to service_role;

create or replace function public.record_whatsapp_memory_director_decision(
  p_actor_id uuid,
  p_organization_id uuid,
  p_decision text,
  p_reason text,
  p_operational_scope_confirmed boolean,
  p_evidence_limits_confirmed boolean,
  p_evidence_measured_at timestamptz,
  p_evidence_snapshot jsonb,
  p_evidence_fingerprint text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_existing public.whatsapp_memory_director_decisions%rowtype;
  v_decision_id uuid;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if p_actor_id is null or p_organization_id is null then
    raise exception 'whatsapp_memory_decision_identity_required';
  end if;
  if v_decision not in ('approve', 'reject') then
    raise exception 'whatsapp_memory_decision_invalid';
  end if;
  if char_length(v_reason) < 20 or char_length(v_reason) > 1000 then
    raise exception 'whatsapp_memory_decision_reason_invalid';
  end if;
  if p_operational_scope_confirmed is not true
     or p_evidence_limits_confirmed is not true then
    raise exception 'whatsapp_memory_decision_confirmations_required';
  end if;
  if p_evidence_measured_at is null
     or p_evidence_measured_at > now() + interval '5 minutes'
     or p_evidence_measured_at < now() - interval '24 hours' then
    raise exception 'whatsapp_memory_decision_evidence_stale';
  end if;
  if jsonb_typeof(p_evidence_snapshot) is distinct from 'object'
     or octet_length(p_evidence_snapshot::text) > 16000
     or coalesce((p_evidence_snapshot ->> 'technicalGateReady')::boolean, false) is not true
     or coalesce((p_evidence_snapshot ->> 'canBeReviewed')::boolean, false) is not true
     or coalesce((p_evidence_snapshot ->> 'containsPii')::boolean, true) is not false
     or coalesce((p_evidence_snapshot ->> 'readsMessageContent')::boolean, true) is not false
     or coalesce((p_evidence_snapshot ->> 'automaticDecision')::boolean, true) is not false
     or coalesce((p_evidence_snapshot ->> 'passedControls')::integer, 0) <= 0
     or coalesce((p_evidence_snapshot ->> 'passedControls')::integer, 0)
        is distinct from coalesce((p_evidence_snapshot ->> 'totalControls')::integer, -1)
     or jsonb_typeof(p_evidence_snapshot -> 'blockers') is distinct from 'array'
     or jsonb_array_length(p_evidence_snapshot -> 'blockers') <> 0 then
    raise exception 'whatsapp_memory_decision_evidence_invalid';
  end if;
  if coalesce(p_evidence_fingerprint, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'whatsapp_memory_decision_fingerprint_invalid';
  end if;
  if coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'whatsapp_memory_decision_idempotency_invalid';
  end if;

  select coalesce(
           p.commercial_role,
           case when p.role = 'admin' then 'director' else p.role end
         )
    into v_actor_role
  from public.profiles p
  where p.id = p_actor_id
    and p.organization_id = p_organization_id
    and p.active is true;

  if v_actor_role is distinct from 'director' then
    raise exception 'whatsapp_memory_decision_actor_forbidden';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_idempotency_key, 0)
  );

  select * into v_existing
  from public.whatsapp_memory_director_decisions d
  where d.organization_id = p_organization_id
    and d.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.actor_id is distinct from p_actor_id
       or v_existing.decision is distinct from v_decision
       or v_existing.reason is distinct from v_reason
       or v_existing.operational_scope_confirmed is distinct from p_operational_scope_confirmed
       or v_existing.evidence_limits_confirmed is distinct from p_evidence_limits_confirmed
       or v_existing.evidence_measured_at is distinct from p_evidence_measured_at
       or v_existing.evidence_snapshot is distinct from p_evidence_snapshot
       or v_existing.evidence_fingerprint is distinct from p_evidence_fingerprint then
      raise exception 'whatsapp_memory_decision_idempotency_conflict';
    end if;

    return jsonb_build_object(
      'decisionId', v_existing.id,
      'decision', v_existing.decision,
      'replayed', true,
      'recordedAt', v_existing.created_at,
      'learningActivated', false
    );
  end if;

  insert into public.whatsapp_memory_director_decisions (
    organization_id,
    actor_id,
    decision,
    reason,
    operational_scope_confirmed,
    evidence_limits_confirmed,
    evidence_measured_at,
    evidence_snapshot,
    evidence_fingerprint,
    idempotency_key
  ) values (
    p_organization_id,
    p_actor_id,
    v_decision,
    v_reason,
    p_operational_scope_confirmed,
    p_evidence_limits_confirmed,
    p_evidence_measured_at,
    p_evidence_snapshot,
    p_evidence_fingerprint,
    p_idempotency_key
  )
  returning id into v_decision_id;

  insert into public.audit_logs (
    organization_id,
    actor_id,
    action,
    module,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_organization_id,
    p_actor_id,
    'whatsapp_memory_director_decision_recorded',
    'whatsapp_memory',
    'whatsapp_memory_director_decision',
    v_decision_id,
    jsonb_build_object(
      'decision', v_decision,
      'reasonLength', char_length(v_reason),
      'evidenceFingerprint', p_evidence_fingerprint,
      'evidenceMeasuredAt', p_evidence_measured_at,
      'idempotencyKey', p_idempotency_key,
      'humanConfirmed', true,
      'learningActivated', false
    )
  );

  return jsonb_build_object(
    'decisionId', v_decision_id,
    'decision', v_decision,
    'replayed', false,
    'recordedAt', now(),
    'learningActivated', false
  );
end;
$$;

revoke all on function public.record_whatsapp_memory_director_decision(
  uuid, uuid, text, text, boolean, boolean, timestamptz, jsonb, text, text
) from public;
revoke all on function public.record_whatsapp_memory_director_decision(
  uuid, uuid, text, text, boolean, boolean, timestamptz, jsonb, text, text
) from anon;
revoke all on function public.record_whatsapp_memory_director_decision(
  uuid, uuid, text, text, boolean, boolean, timestamptz, jsonb, text, text
) from authenticated;
grant execute on function public.record_whatsapp_memory_director_decision(
  uuid, uuid, text, text, boolean, boolean, timestamptz, jsonb, text, text
) to service_role;
