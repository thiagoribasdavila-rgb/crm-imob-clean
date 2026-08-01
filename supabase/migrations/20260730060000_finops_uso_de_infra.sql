-- CENTRO DE CUSTO DE TECNOLOGIA (§8) — a leitura do consumo de infraestrutura.
--
-- ── O que esta migration NÃO faz, e por quê ──────────────────────────────────
--
-- Não cria tabela de custo. Não cria tabela de consumo de IA. `ai_usage_events`
-- já existe, já é gravada por `recordUsage()` em lib/ai/provider-router.ts, e
-- tinha 43 linhas reais no banco canônico em 2026-07-30, das quais 21 cobráveis
-- e 6 sem preço. A frente de orçamento da IA (20260730050000) acrescenta a coluna
-- `agent` e `private.consumo_de_ia_do_dia` na MESMA tabela, e o painel de custo lê
-- essa mesma tabela — não uma cópia.
--
-- Duas tabelas com a mesma verdade é a classe de defeito mais frequente deste
-- repositório: `developments` × `crm_projects`, `pipeline_history` ×
-- `pipeline_stage_moves`, RPC × fallback que divergiram na chave. Um painel de
-- custo com a própria tabela de consumo divergiria do limitador de gastos, e os
-- dois estariam "certos".
--
-- ── O que faltava, e só o banco sabe ─────────────────────────────────────────
--
-- Bytes. O tamanho do banco e do armazenamento não são alcançáveis por
-- PostgREST: `pg_database_size` é função de sistema e `storage.objects` não está
-- exposta ao cliente. Sem esta função o painel teria de declarar "consumo de
-- banco não medido" tendo o número a uma consulta de distância — e "não medido"
-- só vale quando é verdade.
--
-- ── O que esta função deliberadamente NÃO devolve ────────────────────────────
--
-- PREÇO. Nem por gigabyte, nem por linha, nem por chamada. O plano é `free`
-- (medido pela API de gestão em 2026-07-30) e a cota do plano não está em lugar
-- nenhum deste banco. Uma função que devolvesse "custo do banco em dólar"
-- estaria inventando a tarifa, e é exatamente o que a regra permanente do dono
-- proíbe: não inventar preços.
--
-- Ela devolve CONSUMO. Quem sabe transformar consumo em dinheiro é a fatura, e a
-- fatura não está aqui — o painel diz isso com todas as letras.
--
-- ROLLBACK: supabase/rollbacks/20260730060000_finops_uso_de_infra.down.sql
-- (NUNCA .down.sql dentro de migrations/ — cria versão duplicada e o db push
--  aborta no último arquivo depois de já ter aplicado os anteriores. Medido.)

-- ── POR QUE `public` E NÃO `private` ─────────────────────────────────────────
--
-- Primeira tentativa: `private.finops_uso_de_infra()`. Ela FUNCIONA no banco
-- (medida com privilégios corretos: anon não, authenticated não, service_role
-- sim) e é INALCANÇÁVEL pela aplicação: o PostgREST só expõe os schemas
-- configurados, e `supabase-js` não chega em `private`. Todas as 40+ RPCs que
-- este produto chama vivem em `public` — `reservar_leads_do_acervo`,
-- `consume_api_rate_limit`, `accept_lead_assignment`.
--
-- Uma função inalcançável faria o painel declarar "consumo de banco não medido"
-- para sempre, com o número a uma consulta de distância. A cerca real aqui não é
-- o schema, é o GRANT: revogada de public/anon/authenticated, concedida só a
-- service_role — e o contrato prova os dois lados.

create or replace function public.finops_uso_de_infra()
returns table (
  banco_bytes bigint,
  armazenamento_bytes bigint,
  armazenamento_objetos integer,
  armazenamento_buckets integer,
  tabelas_publicas integer,
  linhas_estimadas bigint,
  usuarios_de_autenticacao integer,
  medido_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pg_catalog.pg_database_size(pg_catalog.current_database())::bigint,
    -- `metadata->>'size'` é o que o Storage grava por objeto. Objeto sem
    -- metadata soma zero em vez de derrubar a consulta: linha sem tamanho é
    -- lacuna de um objeto, não motivo para o painel inteiro ficar cego.
    (select coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0) from storage.objects o)::bigint,
    (select count(*) from storage.objects)::integer,
    (select count(*) from storage.buckets)::integer,
    (select count(*) from pg_catalog.pg_stat_user_tables t where t.schemaname = 'public')::integer,
    -- ESTIMADAS, e o nome diz isso. `n_live_tup` é a contagem do coletor de
    -- estatísticas, não um count(*): medido em 2026-07-30, ela dizia 683 linhas
    -- em public.leads quando o count real era 1483. Serve para dimensionar o
    -- banco; NÃO serve como denominador de custo por lead — esse o painel conta
    -- de verdade, na tabela, com a cerca da organização.
    (select coalesce(sum(t.n_live_tup), 0) from pg_catalog.pg_stat_user_tables t where t.schemaname = 'public')::bigint,
    (select count(*) from auth.users)::integer,
    pg_catalog.now();
$$;

revoke all on function public.finops_uso_de_infra() from public;
revoke all on function public.finops_uso_de_infra() from anon;
revoke all on function public.finops_uso_de_infra() from authenticated;
grant execute on function public.finops_uso_de_infra() to service_role;

comment on function public.finops_uso_de_infra() is
  'Consumo de infraestrutura para o Centro de Custo de Tecnologia (§8): bytes de banco e de armazenamento, objetos, buckets e usuários. NÃO devolve preço — o plano free e a cota dele não estão neste banco, e inventar tarifa é proibido. linhas_estimadas vem de pg_stat_user_tables e é estimativa (media 683 para public.leads quando o count real era 1483); nunca use como denominador de custo.';
