begin;

create table if not exists public.executive_homologation_cycles (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  release_version text not null check(char_length(release_version) between 2 and 80), environment text not null default 'homologation' check(environment='homologation'),
  status text not null default 'collecting' check(status in('collecting','ready_for_decision','go','no_go')),
  score integer not null default 0 check(score between 0 and 100), evidence_snapshot jsonb not null default '{}'::jsonb,
  controls jsonb not null default '[]'::jsonb, blocking text[] not null default '{}', evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id), decision_reason text check(decision_reason is null or char_length(decision_reason) between 30 and 2000), decided_at timestamptz,
  unique(organization_id, evidence_hash), check((status in('go','no_go'))=(decided_at is not null))
);
create index if not exists executive_homologation_cycles_org_idx on public.executive_homologation_cycles(organization_id,created_at desc);

create table if not exists public.executive_homologation_signoffs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  cycle_id uuid not null references public.executive_homologation_cycles(id) on delete cascade,
  commercial_role text not null check(commercial_role in('director','superintendent','manager','broker')),
  outcome text not null check(outcome in('passed','failed')), evidence_reference text not null check(char_length(evidence_reference) between 8 and 500),
  notes text not null check(char_length(notes) between 20 and 2000), signed_by uuid not null references public.profiles(id), signed_at timestamptz not null default now(),
  unique(cycle_id,commercial_role)
);
create index if not exists executive_homologation_signoffs_cycle_idx on public.executive_homologation_signoffs(cycle_id,signed_at desc);

alter table public.executive_homologation_cycles enable row level security;
alter table public.executive_homologation_signoffs enable row level security;
create policy executive_cycles_scope_read on public.executive_homologation_cycles for select to authenticated using(organization_id=(select public.current_organization_id()));
create policy executive_signoffs_scope_read on public.executive_homologation_signoffs for select to authenticated using(organization_id=(select public.current_organization_id()));
revoke all on public.executive_homologation_cycles,public.executive_homologation_signoffs from anon,authenticated;
grant select on public.executive_homologation_cycles,public.executive_homologation_signoffs to authenticated;

create or replace function private.enforce_executive_acceptance_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare actor_role text;
begin
  if tg_table_name='executive_homologation_signoffs' then
    if not exists(select 1 from public.executive_homologation_cycles c where c.id=new.cycle_id and c.organization_id=new.organization_id and c.status in('collecting','ready_for_decision')) then raise exception 'Ciclo inválido ou encerrado.' using errcode='23514'; end if;
    select coalesce(p.commercial_role,case when p.role='admin' then 'director' else p.role end) into actor_role from public.profiles p where p.id=new.signed_by and p.organization_id=new.organization_id;
    if actor_role is distinct from new.commercial_role then raise exception 'Assinatura não corresponde ao perfil.' using errcode='23514'; end if;
  else
    if tg_op='INSERT' and not exists(select 1 from public.profiles p where p.id=new.created_by and p.organization_id=new.organization_id and coalesce(p.commercial_role,case when p.role='admin' then 'director' else p.role end)='director') then raise exception 'Ciclo exige diretor.' using errcode='23514'; end if;
    if new.status in('go','no_go') then
      if not exists(select 1 from public.profiles p where p.id=new.decided_by and p.organization_id=new.organization_id and coalesce(p.commercial_role,case when p.role='admin' then 'director' else p.role end)='director') then raise exception 'Decisão exige diretor.' using errcode='23514'; end if;
      if new.status='go' and (new.score<>100 or cardinality(new.blocking)<>0) then raise exception 'GO exige 100 por cento e nenhum bloqueio.' using errcode='23514'; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.enforce_executive_acceptance_integrity() from public,anon,authenticated;
create trigger executive_cycle_integrity before insert or update on public.executive_homologation_cycles for each row execute function private.enforce_executive_acceptance_integrity();
create trigger executive_signoff_integrity before insert on public.executive_homologation_signoffs for each row execute function private.enforce_executive_acceptance_integrity();

create or replace function private.prevent_executive_acceptance_mutation() returns trigger language plpgsql security definer set search_path='' as $$ begin raise exception 'Evidência executiva é imutável.' using errcode='55000'; end $$;
revoke all on function private.prevent_executive_acceptance_mutation() from public,anon,authenticated;
create trigger executive_signoffs_immutable before update or delete on public.executive_homologation_signoffs for each row execute function private.prevent_executive_acceptance_mutation();

commit;
