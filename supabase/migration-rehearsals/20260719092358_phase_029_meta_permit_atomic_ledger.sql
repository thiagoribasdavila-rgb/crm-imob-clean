-- ATLAS AI OS - Fase 29/100
-- Migration de ensaio preservada fora da cadeia oficial para clone isolado.
-- A trava staging_clone impede aplicacao acidental fora do ensaio governado.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $atlas_meta_ledger_environment_guard$
begin
  if current_setting('app.atlas_meta_ledger_environment', true) is distinct from 'staging_clone' then
    raise exception 'atlas_meta_ledger_staging_clone_only';
  end if;
  if to_regclass('public.organizations') is null or to_regclass('public.profiles') is null then
    raise exception 'atlas_meta_ledger_base_contract_missing';
  end if;
end;
$atlas_meta_ledger_environment_guard$;

create schema if not exists atlas_private;

revoke all on schema atlas_private from public;
revoke all on schema atlas_private from anon;
revoke all on schema atlas_private from authenticated;
grant usage on schema atlas_private to service_role;

create or replace function atlas_private.all_distinct_text(p_values text[])
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $function$
  select
    array_position(p_values, null) is null
    and cardinality(p_values) = (
      select count(distinct value)
      from unnest(p_values) as items(value)
    );
$function$;

revoke all on function atlas_private.all_distinct_text(text[]) from public, anon, authenticated;
grant execute on function atlas_private.all_distinct_text(text[]) to service_role;

create table atlas_private.meta_permit_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  slot_id text not null,
  sample_ordinal smallint not null,
  state text not null default 'reserved_unissued',
  revision integer not null,
  phase27_fingerprint text not null,
  phase26_fingerprint text not null,
  ledger_key_fingerprint text not null,
  contract_reference_fingerprint text not null,
  permit_nonce_fingerprint text not null,
  idempotency_fingerprint text not null,
  event_id_fingerprint text not null,
  synthetic_record_fingerprint text not null,
  evidence_fingerprint text not null,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  issued_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_permit_ledger_slot_check check (slot_id = 'repeatability_02' and sample_ordinal = 2),
  constraint meta_permit_ledger_state_check check (state in ('reserved_unissued', 'issued_unconsumed', 'consumed', 'cancelled', 'expired')),
  constraint meta_permit_ledger_initial_revision_check check (revision >= 1),
  constraint meta_permit_ledger_expiry_check check (expires_at > reserved_at and expires_at <= reserved_at + interval '5 minutes'),
  constraint meta_permit_ledger_lifecycle_check check (
    (state = 'reserved_unissued' and issued_at is null and consumed_at is null)
    or (state = 'issued_unconsumed' and issued_at is not null and consumed_at is null)
    or (state = 'consumed' and issued_at is not null and consumed_at is not null and consumed_at >= issued_at)
    or state in ('cancelled', 'expired')
  ),
  constraint meta_permit_ledger_phase27_hash_check check (phase27_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint meta_permit_ledger_phase26_hash_check check (phase26_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint meta_permit_ledger_key_hash_check check (ledger_key_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint meta_permit_ledger_contract_hash_check check (contract_reference_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint meta_permit_ledger_nonce_hash_check check (permit_nonce_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint meta_permit_ledger_idempotency_hash_check check (idempotency_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint meta_permit_ledger_event_hash_check check (event_id_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint meta_permit_ledger_record_hash_check check (synthetic_record_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint meta_permit_ledger_evidence_hash_check check (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint meta_permit_ledger_identity_distinct_check check (
    atlas_private.all_distinct_text(array[
      phase27_fingerprint,
      phase26_fingerprint,
      ledger_key_fingerprint,
      contract_reference_fingerprint,
      permit_nonce_fingerprint,
      idempotency_fingerprint,
      event_id_fingerprint,
      synthetic_record_fingerprint,
      evidence_fingerprint
    ])
  ),
  constraint meta_permit_ledger_key_unique unique (organization_id, ledger_key_fingerprint),
  constraint meta_permit_ledger_nonce_unique unique (organization_id, permit_nonce_fingerprint),
  constraint meta_permit_ledger_idempotency_unique unique (organization_id, idempotency_fingerprint),
  constraint meta_permit_ledger_event_record_unique unique (organization_id, event_id_fingerprint, synthetic_record_fingerprint)
);

create table atlas_private.meta_permit_ledger_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  ledger_id uuid not null references atlas_private.meta_permit_ledger(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  revision integer not null check (revision >= 1),
  transition text not null check (transition in ('reserved', 'issued', 'consumed', 'cancelled', 'expired')),
  from_state text,
  to_state text not null,
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint meta_permit_ledger_audit_transition_unique unique (ledger_id, revision, transition)
);

create index meta_permit_ledger_active_idx
  on atlas_private.meta_permit_ledger (organization_id, state, expires_at, id)
  where state in ('reserved_unissued', 'issued_unconsumed');

create index meta_permit_ledger_audit_timeline_idx
  on atlas_private.meta_permit_ledger_audit (organization_id, ledger_id, created_at, id);

create index meta_permit_ledger_actor_idx
  on atlas_private.meta_permit_ledger (actor_id);

create index meta_permit_ledger_audit_ledger_idx
  on atlas_private.meta_permit_ledger_audit (ledger_id);

create index meta_permit_ledger_audit_actor_idx
  on atlas_private.meta_permit_ledger_audit (actor_id);

alter table atlas_private.meta_permit_ledger enable row level security;
alter table atlas_private.meta_permit_ledger force row level security;
alter table atlas_private.meta_permit_ledger_audit enable row level security;
alter table atlas_private.meta_permit_ledger_audit force row level security;

revoke all on table atlas_private.meta_permit_ledger from public, anon, authenticated;
revoke all on table atlas_private.meta_permit_ledger_audit from public, anon, authenticated;
grant select, insert, update on table atlas_private.meta_permit_ledger to service_role;
grant select, insert on table atlas_private.meta_permit_ledger_audit to service_role;
grant usage, select on sequence atlas_private.meta_permit_ledger_audit_id_seq to service_role;

create or replace function public.atlas_prepare_meta_permit_reservation_v1(
  p_organization_id uuid,
  p_actor_id uuid,
  p_slot_id text,
  p_sample_ordinal smallint,
  p_expected_revision integer,
  p_proposed_revision integer,
  p_expires_at timestamptz,
  p_phase27_fingerprint text,
  p_phase26_fingerprint text,
  p_ledger_key_fingerprint text,
  p_contract_reference_fingerprint text,
  p_permit_nonce_fingerprint text,
  p_idempotency_fingerprint text,
  p_event_id_fingerprint text,
  p_synthetic_record_fingerprint text,
  p_evidence_fingerprint text
)
returns table (
  reservation_id uuid,
  disposition text,
  state text,
  revision integer,
  evidence_fingerprint text,
  expires_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_ledger atlas_private.meta_permit_ledger%rowtype;
begin
  if p_slot_id <> 'repeatability_02' or p_sample_ordinal <> 2 then
    raise exception using errcode = '22023', message = 'meta_ledger_slot_invalid';
  end if;
  if p_expected_revision <> 0 or p_proposed_revision <> 1 then
    raise exception using errcode = '40001', message = 'meta_ledger_revision_conflict';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'meta_ledger_expiry_invalid';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and organization_id = p_organization_id and active is true
  ) then
    raise exception using errcode = '42501', message = 'meta_ledger_actor_out_of_scope';
  end if;

  insert into atlas_private.meta_permit_ledger (
    organization_id, actor_id, slot_id, sample_ordinal, state, revision, expires_at,
    phase27_fingerprint, phase26_fingerprint, ledger_key_fingerprint,
    contract_reference_fingerprint, permit_nonce_fingerprint, idempotency_fingerprint,
    event_id_fingerprint, synthetic_record_fingerprint, evidence_fingerprint
  ) values (
    p_organization_id, p_actor_id, p_slot_id, p_sample_ordinal, 'reserved_unissued', p_proposed_revision, p_expires_at,
    p_phase27_fingerprint, p_phase26_fingerprint, p_ledger_key_fingerprint,
    p_contract_reference_fingerprint, p_permit_nonce_fingerprint, p_idempotency_fingerprint,
    p_event_id_fingerprint, p_synthetic_record_fingerprint, p_evidence_fingerprint
  )
  on conflict do nothing
  returning * into v_ledger;

  if v_ledger.id is null then
    select * into v_ledger
    from atlas_private.meta_permit_ledger
    where organization_id = p_organization_id
      and ledger_key_fingerprint = p_ledger_key_fingerprint;
    if v_ledger.id is null
      or v_ledger.phase27_fingerprint <> p_phase27_fingerprint
      or v_ledger.phase26_fingerprint <> p_phase26_fingerprint
      or v_ledger.contract_reference_fingerprint <> p_contract_reference_fingerprint
      or v_ledger.permit_nonce_fingerprint <> p_permit_nonce_fingerprint
      or v_ledger.idempotency_fingerprint <> p_idempotency_fingerprint
      or v_ledger.event_id_fingerprint <> p_event_id_fingerprint
      or v_ledger.synthetic_record_fingerprint <> p_synthetic_record_fingerprint
      or v_ledger.evidence_fingerprint <> p_evidence_fingerprint
    then
      raise exception using errcode = '23505', message = 'meta_ledger_identity_collision';
    end if;
    return query select v_ledger.id, 'duplicate'::text, v_ledger.state, v_ledger.revision, v_ledger.evidence_fingerprint, v_ledger.expires_at;
    return;
  end if;

  insert into atlas_private.meta_permit_ledger_audit (
    organization_id, ledger_id, actor_id, revision, transition, from_state, to_state, evidence_fingerprint
  ) values (
    p_organization_id, v_ledger.id, p_actor_id, v_ledger.revision, 'reserved', null, v_ledger.state, p_evidence_fingerprint
  );

  return query select v_ledger.id, 'reserved'::text, v_ledger.state, v_ledger.revision, v_ledger.evidence_fingerprint, v_ledger.expires_at;
end;
$function$;

revoke all on function public.atlas_prepare_meta_permit_reservation_v1(uuid, uuid, text, smallint, integer, integer, timestamptz, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.atlas_prepare_meta_permit_reservation_v1(uuid, uuid, text, smallint, integer, integer, timestamptz, text, text, text, text, text, text, text, text, text) to service_role;

comment on function public.atlas_prepare_meta_permit_reservation_v1(uuid, uuid, text, smallint, integer, integer, timestamptz, text, text, text, text, text, text, text, text, text) is
  'Phase 29 isolated rehearsal migration: atomically reserves one sanitized Meta permit identity. It never issues, consumes or delivers an event.';

commit;
