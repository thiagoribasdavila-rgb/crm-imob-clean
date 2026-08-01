-- Backfill do elo de atribuição dos leads JÁ EXISTENTES.
--
-- Por que existe: até agora a ingestão da Meta guardava o identificador da
-- campanha só dentro de metadata->'meta'->>'campaignId' e deixava
-- leads.campaign_id nulo. Como todo agregado por campanha (campaign-quality,
-- cost-report, conselheiro Andromeda) indexa por leads.campaign_id, o histórico
-- inteiro somava zero venda por campanha. A ingestão passou a gravar a coluna;
-- esta migration acerta o passado.
--
-- O QUE ESTA MIGRATION *NÃO* ALCANÇA — dito, não presumido:
--   - PRODUÇÃO (ietwopslgqxlenfyghqk, medido em 2026-07-22): public.leads tem
--     17.151 linhas e NÃO tem a coluna `metadata`. O identificador histórico de
--     campanha mora em leads.campaign (TEXTO livre, digitado/importado), que
--     esta migration não interpreta — casar texto livre com id externo seria
--     heurística de nome, exatamente o que erra em silêncio. Nesses 17.151
--     leads o elo continua nulo, e isso precisa de reconciliação explícita, não
--     de adivinhação de migration.
--   - Por isso a guarda abaixo é por COLUNA, não só por tabela: leads e
--     marketing_campaigns EXISTEM na produção, então guardar só por to_regclass
--     deixaria o UPDATE rodar e estourar 42703 ("column metadata does not
--     exist"), abortando a suíte de migrations inteira na produção.
--   - HOMOLOGAÇÃO (pozbrcsfthnhmnebfoxv, medido em 2026-07-22): 0 leads,
--     0 campanhas. Aplicada hoje, esta migration registra 0 campanha e religa
--     0 lead — não porque falhou, mas porque não há passado ali ainda. Ela
--     passa a valer quando chegarem leads da Meta (ou um dump que traga
--     leads.metadata). Rodar de novo é seguro: é idempotente.
--
-- Regras, e o porquê de cada uma:
--   - só onde campaign_id IS NULL: atribuição registrada não se sobrescreve
--     (append-only por política da Fase 74);
--   - casa exclusivamente por (organization_id, external_campaign_id) — sem
--     heurística de nome de campanha;
--   - campanha AUSENTE é registrada a partir do que o histórico já prova (o
--     próprio lead traz o id externo), com a MESMA convenção da ingestão:
--     prefixo "[auto] " no nome e status PAUSED, porque nada nasce ATIVO e o
--     estado real na Meta nunca foi consultado. Sem esse registro a migration
--     seria INERTE: marketing_campaigns está vazia no banco vivo, então o
--     UPDATE sozinho preencheria ZERO lead e o passado seguiria alimentando o
--     falso "0 vendas";
--   - id externo duplicado dentro da mesma organização é AMBIGUIDADE, não
--     empate a desempatar: o lead é deixado como está — e a migration CONTA e
--     AVISA quantos ficaram assim, em vez de sair calada;
--   - idempotente: rodar de novo não encontra mais nada para preencher, e
--     depois de reconciliar as duplicatas uma segunda execução fecha o resto.
--
-- Gatilho de atribuição DESLIGADO em volta do UPDATE, de propósito:
-- capture_lead_attribution_after_update gravaria um campaign_touch com
-- occurred_at = now() e evidência "Captura automática da origem canônica" para
-- CADA lead corrigido. Um lead de três meses atrás passaria a exibir, na linha
-- do tempo de /leads/[id]/attribution, um contato de marketing datado de hoje
-- que nunca aconteceu — evento inventado —, e o last_attribution_id de toda a
-- base histórica seria reescrito no mesmo instante. Nada de atribuição se
-- perde: o backfill da própria Fase 74 já gravou um first_touch por lead
-- carregando campaign_external_id/adId vindos do metadata, e a leitura por
-- anúncio (lib/marketing/ad-performance.ts) usa o primeiro toque +
-- leads.campaign_id, não o campaign_id do toque. De quebra some o risco de
-- "out of shared memory": record_lead_attribution_touch tira um
-- pg_advisory_xact_lock POR LEAD e o UPDATE roda numa transação só.
--
-- Ordem: depois de 20260722174000 (unique que impede a duplicata que viraria
-- ambiguidade) e de 20260722175000 (FK de lead_attribution_touches repontada).

do $$
declare
  ambiguos          bigint;
  registradas       bigint;
  religados         bigint;
  gatilho_existente boolean;
begin
  if to_regclass('public.leads') is null
     or to_regclass('public.marketing_campaigns') is null then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads' and column_name = 'metadata'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads' and column_name = 'campaign_id'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'marketing_campaigns'
       and column_name = 'external_campaign_id'
  ) then
    raise notice 'backfill: banco sem leads.metadata / leads.campaign_id / marketing_campaigns.external_campaign_id — nada a fazer aqui. Na produção o identificador histórico mora em leads.campaign (texto livre) e NÃO é coberto por este backfill.';
    return;
  end if;

  -- 1) Registra as campanhas que o histórico prova terem existido.
  insert into public.marketing_campaigns (organization_id, name, platform, external_campaign_id, status)
  select distinct
    l.organization_id,
    '[auto] Campanha Meta ' || v.cid || ' (registrada pelo backfill — sem nome no evento)',
    'META',
    v.cid,
    'PAUSED'
  from public.leads l
  cross join lateral (
    select nullif(trim(l.metadata -> 'meta' ->> 'campaignId'), '') as cid
  ) v
  where v.cid is not null
    and l.campaign_id is null
    and not exists (
      select 1 from public.marketing_campaigns c
       where c.organization_id = l.organization_id
         and c.external_campaign_id = v.cid
    );
  get diagnostics registradas = row_count;

  -- 2) Religa os leads, com o gatilho de update desligado (ver cabeçalho).
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
          c.organization_id,
          trim(c.external_campaign_id) as external_campaign_id,
          min(c.id::text)::uuid        as campaign_id,
          count(*)                     as registros
        from public.marketing_campaigns c
        where nullif(trim(c.external_campaign_id), '') is not null
        group by c.organization_id, trim(c.external_campaign_id)
      ) m
     where l.campaign_id is null
       and m.registros = 1
       and m.organization_id = l.organization_id
       and m.external_campaign_id = nullif(trim(l.metadata -> 'meta' ->> 'campaignId'), '');
    get diagnostics religados = row_count;
  exception when others then
    -- O gatilho volta mesmo se o UPDATE falhar: deixar a tabela sem captura de
    -- atribuição seria um estrago maior que a migration que não completou.
    if gatilho_existente then
      execute 'alter table public.leads enable trigger capture_lead_attribution_after_update';
    end if;
    raise;
  end;

  if gatilho_existente then
    execute 'alter table public.leads enable trigger capture_lead_attribution_after_update';
  end if;

  -- 3) O que ficou de fora precisa aparecer: "migration aplicada" não pode ser
  --    lido como "o elo foi religado para todo mundo".
  select count(*) into ambiguos
    from public.leads l
    join (
      select c.organization_id, trim(c.external_campaign_id) as external_campaign_id
        from public.marketing_campaigns c
       where nullif(trim(c.external_campaign_id), '') is not null
       group by c.organization_id, trim(c.external_campaign_id)
      having count(*) > 1
    ) d
      on d.organization_id = l.organization_id
     and d.external_campaign_id = nullif(trim(l.metadata -> 'meta' ->> 'campaignId'), '')
   where l.campaign_id is null;

  raise notice 'backfill: % campanha(s) registrada(s) a partir do histórico, % lead(s) religado(s)', registradas, religados;
  if ambiguos > 0 then
    raise notice 'backfill: % lead(s) SEM elo por id externo duplicado em marketing_campaigns — reconcilie as campanhas e rode de novo (esta migration é idempotente)', ambiguos;
  end if;
end $$;
