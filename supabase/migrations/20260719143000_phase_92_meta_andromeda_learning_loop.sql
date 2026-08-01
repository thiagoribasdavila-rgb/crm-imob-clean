-- Fase 92: ciclos auditáveis de aprendizagem Meta/Andromeda; decisão humana e nenhuma mutação automática.
create table if not exists public.meta_andromeda_learning_cycles(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 window_started_at timestamptz not null,window_ended_at timestamptz not null,signal_version text not null default 'andromeda-v2',
 readiness_score integer not null check(readiness_score between 0 and 100),readiness text not null check(readiness in('blocked','learning','ready_for_controlled_test')),
 evidence jsonb not null,recommendations jsonb not null,blockers text[] not null default '{}',evidence_hash text not null check(evidence_hash~'^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in('draft','approved','rejected','expired')),created_by uuid not null references public.profiles(id),
 decided_by uuid references public.profiles(id),decision_reason text,decided_at timestamptz,created_at timestamptz not null default now(),
 check(window_ended_at>window_started_at),unique(organization_id,evidence_hash)
);
create index if not exists meta_andromeda_cycles_org_idx on public.meta_andromeda_learning_cycles(organization_id,created_at desc);
alter table public.meta_andromeda_learning_cycles enable row level security;
drop policy if exists meta_andromeda_cycle_management_read on public.meta_andromeda_learning_cycles;
create policy meta_andromeda_cycle_management_read on public.meta_andromeda_learning_cycles for select to authenticated using(organization_id=(select public.current_organization_id()) and exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.commercial_role,case when p.role='admin' then 'director' else p.role end) in('director','superintendent')));
revoke all on public.meta_andromeda_learning_cycles from anon,authenticated;grant select on public.meta_andromeda_learning_cycles to authenticated;
create or replace function public.decide_meta_andromeda_cycle(p_actor_id uuid,p_organization_id uuid,p_cycle_id uuid,p_decision text,p_reason text)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare v_status text;begin
 if not exists(select 1 from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true and coalesce(commercial_role,case when role='admin' then 'director' else role end)='director')then raise exception 'andromeda_director_required';end if;
 if p_decision not in('approved','rejected') or char_length(trim(coalesce(p_reason,'')))<20 then raise exception 'andromeda_decision_invalid';end if;
 update public.meta_andromeda_learning_cycles set status=p_decision,decided_by=p_actor_id,decision_reason=trim(p_reason),decided_at=now() where id=p_cycle_id and organization_id=p_organization_id and status='draft' returning status into v_status;
 if v_status is null then raise exception 'andromeda_cycle_not_pending';end if;
 return jsonb_build_object('cycleId',p_cycle_id,'status',v_status,'externalChangeExecuted',false,'directorDecision',true);
end$$;
revoke all on function public.decide_meta_andromeda_cycle(uuid,uuid,uuid,text,text) from public,anon,authenticated;grant execute on function public.decide_meta_andromeda_cycle(uuid,uuid,uuid,text,text) to service_role;
