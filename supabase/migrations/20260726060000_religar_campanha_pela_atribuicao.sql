-- =============================================================================
-- Religar leads.campaign_id a partir da ATRIBUIÇÃO — que é onde o dado existe
-- =============================================================================
--
-- MEDIDO EM 2026-07-26, depois de aplicar as 7 migrations que estavam pendentes:
--
--   leads                                        214
--   leads com campaign_id                          0
--   marketing_campaigns                            0
--   lead_attribution_touches                     391
--   toques com campaign_external_id preenchido    24  (1 campanha real da Meta)
--
-- O backfill 20260722180000 procurava o identificador da campanha em
-- `leads.metadata -> 'meta' ->> 'campaignId'`. Nesta base ele não está ali: está
-- em `lead_attribution_touches.campaign_external_id`, gravado pelo importador de
-- Lead Ads com conjunto, anúncio e formulário. O backfill rodou, não encontrou
-- nada e — corretamente — não inventou nada.
--
-- CONSEQUÊNCIA PRÁTICA, e é o que esta migration corrige:
-- sem `leads.campaign_id`, NENHUMA pergunta de campanha tem resposta. Não dá
-- para dizer quantas leads a campanha trouxe, quantas foram atendidas no prazo,
-- quantas viraram visita — nem para alimentar o Andromeda com sinal de fundo de
-- funil, que é justamente o que faz a otimização da Meta buscar gente parecida
-- com quem COMPRA, e não com quem preenche formulário.
--
-- O QUE FAZ
--   1. Registra em marketing_campaigns as campanhas que a atribuição prova terem
--      existido, com nome explicitamente marcado como automático — o nome real
--      só a Meta tem, e inventar um seria pior que admitir a lacuna.
--   2. Religa leads.campaign_id quando o vínculo é ÚNICO e não ambíguo.
--   3. Preenche lead_attribution_touches.campaign_id (o elo interno que a FK
--      recém-corrigida em 20260722175000 agora permite).
--
-- O QUE NÃO FAZ
-- Não apaga, não deduplica em silêncio e não adivinha. Lead cuja campanha externa
-- aparece em mais de um registro fica SEM elo e é reportada — reconciliação de
-- campanha é decisão humana. O gatilho de atribuição é desligado durante o
-- update e religado inclusive em caso de erro, porque deixar a tabela sem captura
-- seria estrago maior que a migration não completar.
--
-- Idempotente: rodar de novo não duplica campanha nem reescreve elo existente.
-- =============================================================================

do $$
declare
  registradas bigint := 0;
  religados   bigint := 0;
  toques      bigint := 0;
  ambiguos    bigint := 0;
  gatilho_existente boolean;
begin
  if to_regclass('public.leads') is null
     or to_regclass('public.marketing_campaigns') is null
     or to_regclass('public.lead_attribution_touches') is null then
    raise notice 'religar-campanha: banco sem as tabelas necessárias — nada a fazer';
    return;
  end if;

  -- 1) As campanhas que a atribuição prova terem existido.
  insert into public.marketing_campaigns (organization_id, name, platform, external_campaign_id, status)
  select distinct
    t.organization_id,
    '[auto] Campanha Meta ' || t.campaign_external_id || ' (registrada pela atribuição — nome real só a Meta tem)',
    'META',
    t.campaign_external_id,
    'PAUSED'
  from public.lead_attribution_touches t
  where nullif(trim(t.campaign_external_id), '') is not null
    and not exists (
      select 1 from public.marketing_campaigns c
       where c.organization_id = t.organization_id
         and c.platform = 'META'
         and c.external_campaign_id = t.campaign_external_id
    );
  get diagnostics registradas = row_count;

  -- 2) O elo da lead. Desligar o gatilho de atribuição evita que religar o
  --    campaign_id gere um toque novo para cada lead — o histórico não mudou,
  --    só passou a ter nome.
  select exists (
    select 1 from pg_trigger
     where tgrelid = 'public.leads'::regclass
       and tgname = 'capture_lead_attribution_after_update'
       and not tgisinternal
  ) into gatilho_existente;

  if gatilho_existente then
    execute 'alter table public.leads disable trigger capture_lead_attribution_after_update';
  end if;

  begin
    update public.leads l
       set campaign_id = m.campaign_id
      from (
        select
          t.organization_id,
          t.lead_id,
          min(c.id::text)::uuid as campaign_id,
          count(distinct c.id)  as registros
        from public.lead_attribution_touches t
        join public.marketing_campaigns c
          on c.organization_id = t.organization_id
         and c.platform = 'META'
         and c.external_campaign_id = t.campaign_external_id
        where nullif(trim(t.campaign_external_id), '') is not null
        group by t.organization_id, t.lead_id
      ) m
     where l.id = m.lead_id
       and l.organization_id = m.organization_id
       and l.campaign_id is null
       and m.registros = 1;
    get diagnostics religados = row_count;
  exception when others then
    if gatilho_existente then
      execute 'alter table public.leads enable trigger capture_lead_attribution_after_update';
    end if;
    raise;
  end;

  if gatilho_existente then
    execute 'alter table public.leads enable trigger capture_lead_attribution_after_update';
  end if;

  -- 3) O elo interno do próprio toque.
  update public.lead_attribution_touches t
     set campaign_id = c.id
    from public.marketing_campaigns c
   where c.organization_id = t.organization_id
     and c.platform = 'META'
     and c.external_campaign_id = t.campaign_external_id
     and t.campaign_id is null;
  get diagnostics toques = row_count;

  -- 4) O que ficou de fora precisa aparecer.
  select count(*) into ambiguos
    from public.leads l
   where l.campaign_id is null
     and exists (
       select 1 from public.lead_attribution_touches t
        where t.lead_id = l.id
          and nullif(trim(t.campaign_external_id), '') is not null
     );

  raise notice 'religar-campanha: % campanha(s) registrada(s), % lead(s) religada(s), % toque(s) com elo interno', registradas, religados, toques;
  if ambiguos > 0 then
    raise notice 'religar-campanha: % lead(s) com atribuição mas SEM elo (campanha ambígua) — reconcilie antes de medir por campanha', ambiguos;
  end if;
end $$;
