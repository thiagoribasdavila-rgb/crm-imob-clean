-- Completa o controle financeiro de comissões sem movimentar dinheiro automaticamente.
alter table public.opportunities add column if not exists commission_gross numeric(14,2);
alter table public.opportunities add column if not exists commission_percentage numeric(7,4);
alter table public.opportunities add column if not exists commission_split_percentage numeric(7,4);
alter table public.opportunities add column if not exists commission_net numeric(14,2);
alter table public.opportunities add column if not exists commission_received_amount numeric(14,2) not null default 0;
alter table public.opportunities add column if not exists commission_notes text;
alter table public.opportunities add column if not exists commission_receipt_path text;

alter table public.opportunities drop constraint if exists opportunities_commission_status_check;
alter table public.opportunities add constraint opportunities_commission_status_check
  check (commission_status in ('not_applicable','pending','due_soon','overdue','partial','received','divergent'));
alter table public.opportunities add constraint opportunities_commission_values_check check (
  coalesce(commission_gross, 0) >= 0 and coalesce(commission_net, 0) >= 0 and commission_received_amount >= 0
  and (commission_percentage is null or commission_percentage between 0 and 100)
  and (commission_split_percentage is null or commission_split_percentage between 0 and 100)
);

create or replace function public.refresh_commission_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.won_at is null then new.commission_status := 'not_applicable';
  elsif new.commission_net is not null and new.commission_received_amount > new.commission_net then new.commission_status := 'divergent';
  elsif new.commission_received_at is not null or (new.commission_net is not null and new.commission_received_amount = new.commission_net) then new.commission_status := 'received';
  elsif new.commission_received_amount > 0 then new.commission_status := 'partial';
  elsif new.commission_due_at < now() then new.commission_status := 'overdue';
  elsif new.commission_due_at <= now() + interval '7 days' then new.commission_status := 'due_soon';
  else new.commission_status := 'pending'; end if;
  return new;
end $$;

drop trigger if exists trg_refresh_commission_status on public.opportunities;
create trigger trg_refresh_commission_status before insert or update of won_at,commission_due_at,commission_net,commission_received_amount,commission_received_at on public.opportunities for each row execute function public.refresh_commission_status();

create table if not exists public.commission_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('configured','partial_payment','received','due_date_changed','divergence','note')),
  amount numeric(14,2),
  previous_value jsonb not null default '{}'::jsonb,
  current_value jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.commission_events enable row level security;
create policy commission_events_org_select on public.commission_events for select to authenticated using (organization_id = public.current_organization_id());
revoke insert,update,delete on public.commission_events from authenticated,anon;
create index if not exists commission_events_opportunity_idx on public.commission_events (opportunity_id,created_at desc);
