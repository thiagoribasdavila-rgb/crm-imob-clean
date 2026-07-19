begin;

alter table public.meta_daily_reports drop constraint if exists meta_daily_reports_status_check;
alter table public.meta_daily_reports add constraint meta_daily_reports_status_check check (status in ('generating','ready','reviewed','failed'));

create or replace function public.claim_meta_daily_report(p_organization_id uuid, p_report_date date)
returns table(report_id uuid, claimed boolean, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare current_report public.meta_daily_reports;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_report_date::text, 0));
  select * into current_report from public.meta_daily_reports
  where organization_id = p_organization_id and report_date = p_report_date;
  if current_report.id is null then
    insert into public.meta_daily_reports (organization_id, report_date, status, payload)
    values (p_organization_id, p_report_date, 'generating', jsonb_build_object('startedAt', now()))
    returning id into report_id;
    return query select report_id, true, 'created'::text;
  end if;
  if current_report.status = 'failed' or (current_report.status = 'generating' and current_report.updated_at < now() - interval '10 minutes') then
    update public.meta_daily_reports set status = 'generating', payload = jsonb_build_object('startedAt', now()), updated_at = now()
    where id = current_report.id;
    return query select current_report.id, true, 'retry'::text;
  end if;
  return query select current_report.id, false, current_report.status;
end;
$$;

revoke all on function public.claim_meta_daily_report(uuid, date) from public, anon, authenticated;
grant execute on function public.claim_meta_daily_report(uuid, date) to service_role;

commit;
