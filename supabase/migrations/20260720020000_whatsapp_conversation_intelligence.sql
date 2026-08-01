-- WhatsApp Intelligence (entrada) — insight por mensagem recebida do cliente:
-- intenção, objeções, resumo e próxima ação. Aditivo; alimentado por um job de
-- outbox (whatsapp.inbound.analyze) que só é enfileirado quando
-- ATLAS_WHATSAPP_NLU_ENABLED=true (custo de LLM é opt-in).

create table if not exists public.whatsapp_message_insights(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid,
  message_id uuid unique,
  lead_id uuid references public.leads(id) on delete set null,
  intent text not null,
  objection_keys text[] not null default '{}',
  summary text,
  recommended_action_key text,
  temperature_signal text,
  source text not null default 'ai' check(source in ('ai','fallback')),
  model text,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_insights_org_idx on public.whatsapp_message_insights(organization_id, created_at desc);
create index if not exists whatsapp_insights_lead_idx on public.whatsapp_message_insights(lead_id, created_at desc);

alter table public.whatsapp_message_insights enable row level security;
create policy whatsapp_insights_org_read on public.whatsapp_message_insights for select to authenticated
  using(organization_id=(select public.current_organization_id()));
revoke all on public.whatsapp_message_insights from anon, authenticated;
grant select on public.whatsapp_message_insights to authenticated;
