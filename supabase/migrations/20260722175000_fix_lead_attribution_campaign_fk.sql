-- Pré-requisito do religamento de leads.campaign_id (ingestão Meta + backfill).
--
-- Por que existe: leads.campaign_id referencia public.marketing_campaigns
-- (leads_campaign_tenant_fkey), mas lead_attribution_touches.campaign_id
-- referenciava public.campaigns — outra tabela, que migration nenhuma popula e
-- que sequer existe no banco de produção. O gatilho
-- private.capture_lead_attribution (Fase 74) repassa new.campaign_id direto
-- para public.record_lead_attribution_touch, que grava esse mesmo uuid em
-- lead_attribution_touches.campaign_id.
--
-- Enquanto leads.campaign_id foi sempre nulo, a divergência nunca detonou. No
-- primeiro lead com campanha resolvida a FK falharia e, como o gatilho é AFTER
-- INSERT na MESMA transação, derrubaria o INSERT do lead inteiro: ligar a
-- atribuição, sem esta correção, quebraria a ingestão da Meta.
--
-- Nada é apagado e nada é adivinhado: se houver toque apontando para campanha
-- fora de marketing_campaigns, a migration PARA e diz o que encontrou, em vez
-- de zerar atribuição (imutável por política da Fase 74).
--
-- Segura em banco sem as tabelas (produção não tem nenhuma das duas) e
-- idempotente: sai cedo quando o objeto não existe ou quando a FK já aponta
-- para o lugar certo.

do $$
declare
  divergentes bigint;
  restricao   record;
begin
  if to_regclass('public.lead_attribution_touches') is null
     or to_regclass('public.marketing_campaigns') is null then
    return;
  end if;

  if exists (
    select 1
      from pg_constraint
     where conrelid = 'public.lead_attribution_touches'::regclass
       and contype = 'f'
       and confrelid = 'public.marketing_campaigns'::regclass
       and pg_get_constraintdef(oid) like 'FOREIGN KEY (campaign_id)%'
  ) then
    return;
  end if;

  select count(*) into divergentes
    from public.lead_attribution_touches t
   where t.campaign_id is not null
     and not exists (
       select 1 from public.marketing_campaigns c where c.id = t.campaign_id
     );
  if divergentes > 0 then
    raise exception
      'lead_attribution_touches tem % toque(s) com campaign_id fora de marketing_campaigns; reconcilie antes de repontar a FK',
      divergentes;
  end if;

  -- Remove por definição, não por nome: bancos com a FK renomeada continuariam
  -- com a referência antiga ao lado da nova.
  for restricao in
    select conname
      from pg_constraint
     where conrelid = 'public.lead_attribution_touches'::regclass
       and contype = 'f'
       and pg_get_constraintdef(oid) like 'FOREIGN KEY (campaign_id)%'
  loop
    execute format(
      'alter table public.lead_attribution_touches drop constraint %I',
      restricao.conname
    );
  end loop;

  alter table public.lead_attribution_touches
    add constraint lead_attribution_touches_campaign_id_fkey
    foreign key (campaign_id) references public.marketing_campaigns (id)
    on delete set null;
end $$;
