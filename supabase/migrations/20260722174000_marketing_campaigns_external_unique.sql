-- Invariante que o CÓDIGO já pressupunha e que só a produção tinha.
--
-- app/api/v2/outbox/process/route.ts resolve a campanha da Meta com
-- select → insert → re-select. Esse padrão só evita duplicata quando o BANCO
-- rejeita o segundo insert. Medido nos bancos vivos em 2026-07-22:
--   - produção (ietwopslgqxlenfyghqk): UNIQUE
--     marketing_campaigns_organization_id_platform_external_campa_key
--     (organization_id, platform, external_campaign_id) — existe;
--   - homologação (pozbrcsfthnhmnebfoxv, alvo do deploy): só pkey,
--     (id, organization_id) e dois índices comuns — NÃO existe.
-- E nenhuma migration do repositório criava esse unique em lugar nenhum.
--
-- Sem ele, dois workers do outbox processando leads da mesma campanha em
-- paralelo inserem os DOIS com sucesso: a campanha vira duas linhas, os leads
-- se dividem entre dois uuids, cada metade cai abaixo do gate de 30 leads,
-- o gasto gruda em só uma delas e o backfill 20260722180000 (que exige
-- registro único) desiste e deixa o elo nulo. É drift de esquema, não
-- preferência — esta migration alinha homologação à produção.
--
-- A chave inclui platform DE PROPÓSITO, para ser a MESMA da produção: sem ela,
-- criar (organization_id, external_campaign_id) aqui divergiria do banco que
-- já está no ar. O lookup do código passa a filtrar platform='META' pelo mesmo
-- motivo — código e índice precisam concordar.
--
-- Nada é deduplicado em silêncio: se já houver duplicata, a migration PARA e
-- diz quantos grupos encontrou, para a reconciliação ser decisão humana.
-- Idempotente: sai cedo quando a tabela não existe ou quando um único
-- equivalente já cobre exatamente essas três colunas (a produção sai aqui, sem
-- ganhar um segundo índice redundante).

do $$
declare
  grupos_duplicados bigint;
begin
  if to_regclass('public.marketing_campaigns') is null then
    return;
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'marketing_campaigns'
       and column_name = 'external_campaign_id'
  ) then
    return;
  end if;

  -- Já existe unique cobrindo exatamente as três colunas? (compara o CONJUNTO
  -- de colunas, não o nome: a produção usa nome gerado pelo Postgres.)
  if exists (
    select 1
      from pg_index i
     where i.indrelid = 'public.marketing_campaigns'::regclass
       and i.indisunique
       and i.indpred is null
       and i.indnatts = 3
       and (
         select array_agg(a.attname::text order by a.attname::text)
           from unnest(i.indkey::int2[]) as k(attnum)
           join pg_attribute a
             on a.attrelid = i.indrelid
            and a.attnum = k.attnum
       ) = array['external_campaign_id', 'organization_id', 'platform']
  ) then
    return;
  end if;

  select count(*) into grupos_duplicados
    from (
      select 1
        from public.marketing_campaigns
       where external_campaign_id is not null
       group by organization_id, platform, external_campaign_id
      having count(*) > 1
    ) d;

  if grupos_duplicados > 0 then
    raise exception
      'marketing_campaigns tem % grupo(s) (organization_id, platform, external_campaign_id) duplicados; reconcilie as campanhas (repontando leads.campaign_id e marketing_spend.campaign_id para a linha que fica) antes de criar o índice único',
      grupos_duplicados;
  end if;

  -- Sem WHERE: espelha o índice da produção. external_campaign_id nulo não
  -- conflita (unique btree trata NULL como distinto), então campanha cadastrada
  -- à mão sem id externo continua livre.
  create unique index marketing_campaigns_org_platform_external_uidx
    on public.marketing_campaigns (organization_id, platform, external_campaign_id);
end $$;
