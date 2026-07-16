-- SLA de recebimento por incorporadora e acompanhamento nas vendas ganhas.
alter table public.developments add column if not exists commission_sla_days integer not null default 30 check (commission_sla_days between 0 and 365);
alter table public.opportunities add column if not exists commission_sla_days integer;
alter table public.opportunities add column if not exists commission_due_at timestamptz;
alter table public.opportunities add column if not exists commission_received_at timestamptz;
alter table public.opportunities add column if not exists commission_status text not null default 'not_applicable' check (commission_status in ('not_applicable','pending','overdue','received'));

create or replace function public.apply_opportunity_commission_sla() returns trigger language plpgsql security definer set search_path = public as $$
declare sla integer;
begin
  if new.won_at is not null and (tg_op = 'INSERT' or old.won_at is null) then
    select coalesce(d.commission_sla_days, 30) into sla
    from public.properties p left join public.developments d on d.id = p.development_id
    where p.id = new.property_id;
    new.commission_sla_days := coalesce(sla, 30);
    new.commission_due_at := new.won_at + make_interval(days => coalesce(sla, 30));
    new.commission_status := 'pending';
  end if;
  if new.commission_received_at is not null then new.commission_status := 'received';
  elsif new.commission_due_at is not null and new.commission_due_at < now() then new.commission_status := 'overdue';
  end if;
  return new;
end $$;

drop trigger if exists trg_opportunity_commission_sla on public.opportunities;
create trigger trg_opportunity_commission_sla before insert or update of won_at,commission_received_at on public.opportunities for each row execute function public.apply_opportunity_commission_sla();
create index if not exists opportunities_commission_due_idx on public.opportunities (organization_id, commission_status, commission_due_at) where won_at is not null;

update public.opportunities o set
  commission_sla_days = coalesce(d.commission_sla_days, 30),
  commission_due_at = o.won_at + make_interval(days => coalesce(d.commission_sla_days, 30)),
  commission_status = case when o.commission_received_at is not null then 'received' when o.won_at + make_interval(days => coalesce(d.commission_sla_days, 30)) < now() then 'overdue' else 'pending' end
from public.properties p left join public.developments d on d.id = p.development_id
where o.property_id = p.id and o.won_at is not null and o.commission_due_at is null;
