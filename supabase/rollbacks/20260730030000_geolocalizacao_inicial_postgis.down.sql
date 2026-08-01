-- ── ROLLBACK DA 4.6 GEOLOCALIZAÇÃO INICIAL ─────────────────────────────────
--
-- Desfaz `supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql`.
--
-- ⚠ ESTE ARQUIVO MORA EM `supabase/rollbacks/`, NUNCA EM `supabase/migrations/`.
-- Um `.down.sql` dentro de migrations/ cria versão DUPLICADA e o `db push` aborta
-- no último arquivo DEPOIS de já ter aplicado os anteriores — meia migration
-- aplicada, que é o pior estado possível. Medido.
--
-- ── O QUE ESTE ROLLBACK APAGA, E O QUE ELE DEIXA DE PROPÓSITO ──────────────
--
-- APAGA: as 7 funções, o cache, os índices, as constraints e as 4 colunas novas
-- de `developments` (`geo`, `geo_fonte`, `geo_confirmado_em`, `geo_precisao_m`).
--
-- NÃO APAGA `developments.latitude` / `developments.longitude`: elas JÁ EXISTIAM
-- antes desta migration (medido em 2026-07-30, com 0 de 4 preenchidas). Derrubá-las
-- aqui destruiria coluna que não é minha — rollback que apaga mais do que criou é
-- perda de dado disfarçada de limpeza.
--
-- NÃO REMOVE A EXTENSÃO `postgis` por padrão. `drop extension postgis` derruba EM
-- CASCATA qualquer coluna/índice/função geográfica que outra frente tenha criado
-- depois desta — inclusive de outro workflow. A remoção fica no rodapé, comentada,
-- para ser uma decisão consciente de quem lê, não um efeito colateral.
--
-- ── PERDA DE DADO DECLARADA ────────────────────────────────────────────────
--
-- `public.geocode_cache` é DROPADA: todo endereço já confirmado à mão se vai, e
-- com ele o contador `consultas_evitadas`. Se houver linha lá que valha algo,
-- EXPORTE ANTES:
--     copy (select endereco_normalizado, endereco_original, latitude, longitude,
--                  fonte, provedor, precisao_m, confirmado_em, consultas_evitadas
--             from public.geocode_cache) to stdout with csv header;
-- Medido em 2026-07-30 ao fim desta entrega: 0 linhas no cache (os registros de
-- teste foram removidos), então HOJE o rollback não perde nada.

begin;

drop function if exists public.concentracao_de_demanda_cobertura(uuid);
drop function if exists public.concentracao_de_demanda_por_regiao(uuid);
drop function if exists public.empreendimentos_por_regiao(uuid);
drop function if exists public.imoveis_no_raio(uuid, numeric, numeric, numeric, integer);
drop function if exists public.empreendimentos_no_raio(uuid, numeric, numeric, numeric, integer);
drop function if exists public.distancia_aproximada_m(numeric, numeric, numeric, numeric);
drop function if exists public.geocode_cache_gravar(text, numeric, numeric, text, numeric, text);
drop function if exists public.geocodificar_do_cache(text);

drop index if exists public.geocode_cache_geo_gist;
drop table if exists public.geocode_cache;

drop index if exists public.developments_geo_gist;
drop index if exists public.developments_regiao_idx;

alter table public.developments
  drop constraint if exists developments_geo_procedencia_check,
  drop constraint if exists developments_geo_fonte_check,
  drop constraint if exists developments_latitude_faixa_check,
  drop constraint if exists developments_longitude_faixa_check;

-- `geo` é coluna GERADA: cai sem tocar em latitude/longitude, que ficam.
alter table public.developments
  drop column if exists geo,
  drop column if exists geo_fonte,
  drop column if exists geo_confirmado_em,
  drop column if exists geo_precisao_m;

-- `private.normalizar_endereco` é usada SÓ por esta frente (conferir com
-- `\df+ private.normalizar_endereco` e um grep antes, caso outra frente passe a
-- chamá-la).
drop function if exists private.normalizar_endereco(text);

commit;

-- ── REMOÇÃO DA EXTENSÃO — DECISÃO CONSCIENTE, FORA DA TRANSAÇÃO ────────────
--
-- Só rode se NENHUMA outra frente usar geografia. Confira primeiro:
--
--   select n.nspname, c.relname, a.attname
--     from pg_attribute a
--     join pg_class c on c.oid = a.attrelid
--     join pg_namespace n on n.oid = c.relnamespace
--     join pg_type t on t.oid = a.atttypid
--    where t.typname in ('geography','geometry') and a.attnum > 0 and not a.attisdropped;
--
-- Se voltar VAZIO, e só então:
--
--   drop extension if exists postgis;
