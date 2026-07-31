-- ── 4.6 GEOLOCALIZAÇÃO INICIAL — A FUNDAÇÃO, MEDIDA ANTES DE ESCRITA ────────
--
-- MEDIDO no banco canônico (pozbrcsfthnhmnebfoxv) em 2026-07-30, EXECUTANDO:
--
--   · `postgis` 3.3.7 estava DISPONÍVEL e NÃO INSTALADA (installed_version=null).
--     Instalada em `extensions` (o mesmo schema de uuid-ossp/pgcrypto aqui) e
--     CONFERIDA contra os valores de referência do WGS84, não contra "parece
--     certo":
--         1 grau de LATITUDE               = 110.574,4 m  (referência: 110.574)
--         1 grau de LONGITUDE no equador   = 111.319,5 m  (referência: 111.320)
--     A MESMA distância em `geometry` devolveu 1.0000 — GRAUS. É exatamente o
--     erro que esta migration existe para tornar impossível: `geography` sempre,
--     `geometry` nunca. Custo: R$ 0 — é extensão do Postgres que já pagamos.
--
--   · `developments` JÁ TINHA `latitude`/`longitude` numeric — e ZERO das 4
--     linhas preenchida. A coluna existia e mentia por omissão desde sempre.
--     Nenhuma coordenada é inventada aqui: seguem 0 de 4 geocodificados, e é
--     a resposta honesta. Ver `geo_fonte`/`geo_confirmado_em` abaixo.
--
--   · `leads`, snapshot ATÔMICO de 2026-07-30 04:19 UTC (ver aviso abaixo):
--     483 linhas no banco todo, 482 na organização 7c8c71c1 e 1 em outra.
--       `preferred_regions`        preenchida em   0  <= a coluna existe e mente
--       `preferred_neighborhoods`  preenchida em   6  ("brooklin", "vilaolímpia",
--          "perdizes/pompeia", "perdizes", "brooklin", "perdizes" — minúsculas,
--          sem espaço, com barra: dado sujo, daí `private.normalizar_endereco`)
--       `development_id`           preenchida em 192  (174 em Inside Perdizes,
--          11 em Arvo, 7 em Spin Mood)
--       sem sinal NENHUM de região:              290
--     Ou seja: o sinal de demanda que EXISTE é o empreendimento de interesse,
--     não a região declarada. A concentração lê os dois e a cobertura publica
--     quantas leads não sustentam o mapa.
--
--     ⚠ `leads` MEXEU durante esta sessão: a primeira contagem deu 683 e a
--     seguinte 483, porque outro workflow estava inserindo e limpando leads de
--     teste ao mesmo tempo. Por isso os números acima vêm de UMA query só, num
--     instante só — contagens colhidas em queries separadas não fecham entre si,
--     e um número que não fecha é pior que nenhum.
--
-- ── AS TRÊS DECISÕES DE DESENHO QUE EVITAM "DUAS VERDADES" ──────────────────
--
-- Este repositório já pagou caro pela mesma classe de defeito (`developments` vs
-- `crm_projects`, `move.moveId` vs `move.id`, RPC vs fallback divergentes). As
-- três decisões abaixo são para NÃO criar a quarta.
--
-- (1) `developments.geo` é COLUNA GERADA de latitude/longitude, não uma terceira
--     coluna que alguém preenche à mão. `lat`/`lng` continuam sendo a ÚNICA
--     verdade editável — é o que atende "permitir correção manual" do dono — e o
--     ponto é DERIVADO. Assim é impossível o par numérico apontar para um lugar
--     e o ponto geográfico para outro. A ordem é `ST_MakePoint(lng, lat)`:
--     longitude PRIMEIRO. Invertida, um empreendimento em São Paulo
--     (lat -23,57 / lng -46,64) cai no Atlântico — e as duas variações passam
--     no CHECK de faixa, porque -46 é uma latitude válida. Só a asserção de
--     ordem no contrato pega isso.
--
-- (2) `properties` NÃO ganha coordenada. Medido: é tabela de UNIDADE
--     (unit_number, tower, floor, typology_id) com `development_id`, 0 linhas e
--     27 colunas, nenhuma de endereço. Unidade não tem endereço próprio: ela
--     herda o do empreendimento. Uma coluna de coordenada por unidade seria a
--     mesma verdade copiada N vezes por prédio, divergindo na primeira correção
--     manual. "Imóveis próximos" sai de `public.imoveis_no_raio`, que junta
--     `properties` -> `developments` e usa o ponto do EMPREENDIMENTO.
--
-- (3) `crm_projects` NÃO ganha coordenada, apesar de ter `address`/`city`/
--     `neighborhood`. Medido: 4 linhas, `address` preenchida em 0, e
--     `20260727010000_unifica_empreendimentos_em_developments.sql` já a declarou
--     ÓRFÃ — as 192 leads apontam para `developments`. Geocodificar a tabela que
--     o repositório abandonou é fabricar a divergência de propósito.
--
-- ── LEAD NÃO GANHA COORDENADA — E ISSO É REQUISITO, NÃO LACUNA ──────────────
--
-- O dono proibiu expor localização residencial exata (item 5.4). Por isso não
-- existe `leads.geo` nesta migration e não deve passar a existir: a concentração
-- de demanda sai de ONDE O CLIENTE QUER COMPRAR (empreendimento de interesse ou
-- bairro preferido), nunca de onde ele mora. A porta fica fechada no banco, não
-- só combinada na aplicação.
--
-- ── O CACHE, E POR QUE ELE NÃO CONTRATA NADA ───────────────────────────────
--
-- A Fase 1 (teto R$ 0–250/mês) NÃO contrata API de geocodificação. O cache
-- entra ALIMENTADO À MÃO/por importação, com `fonte` declarada e
-- `confirmado_em`, para que no dia em que uma API for contratada o mesmo
-- endereço nunca seja consultado duas vezes. `consultas_evitadas` conta os
-- acertos: é a métrica que justifica (ou não) continuar.
-- O que uma API de geocodificação custaria SE fosse contratada: NÃO MEDIDO —
-- confirmar preço oficial antes de contratar. Nenhum número plausível aqui.
--
-- ROLLBACK: supabase/rollbacks/20260730030000_geolocalizacao_inicial_postgis.down.sql
-- (NUNCA `.down.sql` dentro de migrations/ — cria versão duplicada e o db push
-- aborta no último arquivo, depois de já ter aplicado os anteriores.)
--
-- ── ESTE ARQUIVO É A VERDADE, E ISSO FOI PROVADO EXECUTANDO ────────────────
--
-- O ledger `supabase_migrations.schema_migrations` tem TRÊS entradas para esta
-- frente, porque ela foi aplicada e corrigida duas vezes durante a entrega:
--     20260730041507  geolocalizacao_inicial_postgis
--     20260730041808  geolocalizacao_corrige_ambiguidade_do_out_param
--     20260730042023  geolocalizacao_demanda_nao_perde_lead_sem_bairro
-- Este ARQUIVO ÚNICO é o estado final consolidado das três. Não é promessa: em
-- 2026-07-30 04:4x UTC o rollback foi aplicado DE VERDADE (4 colunas, a tabela,
-- 9 funções e 3 índices REMOVIDOS; `latitude`/`longitude` e a extensão
-- PRESERVADAS, como este cabeçalho promete) e depois ESTE arquivo foi reaplicado
-- do zero. O contrato saiu de 8 falhas com o banco vazio para 19/19 verdes.
-- Ou seja: o repositório reconstrói o banco, e a PARTE A do contrato não é
-- decorativa — ela cai quando o banco não tem a frente.

-- ── 1. A EXTENSÃO ───────────────────────────────────────────────────────────

create extension if not exists postgis with schema extensions;

-- ── 2. NORMALIZAÇÃO DE ENDEREÇO — A CHAVE DO CACHE ─────────────────────────
--
-- IMMUTABLE de propósito: é o que permite usá-la em coluna gerada e em índice.
-- `unaccent` NÃO é usada — ela é STABLE, não IMMUTABLE, e envenenaria os dois.
-- `translate` faz o dobramento de acento e é imutável de verdade.
-- Devolve null para entrada vazia: endereço em branco não vira chave "".

create or replace function private.normalizar_endereco(p_endereco text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        lower(
          translate(
            coalesce(p_endereco, ''),
            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
            'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
          )
        ),
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
    ''
  );
$$;

comment on function private.normalizar_endereco(text) is
  'Chave canônica de endereço: minúsculas, sem acento, sem pontuação, espaços colapsados. IMMUTABLE para servir de índice. Medido em "Rua Mário Amaral, 267 - Paraíso/SP" -> "rua mario amaral 267 paraiso sp".';

revoke all on function private.normalizar_endereco(text) from public;
revoke all on function private.normalizar_endereco(text) from anon;
revoke all on function private.normalizar_endereco(text) from authenticated;
grant execute on function private.normalizar_endereco(text) to service_role;

-- ── 3. COORDENADA EM `developments` ────────────────────────────────────────

alter table public.developments
  add column if not exists geo extensions.geography(Point, 4326)
    generated always as (
      case
        when latitude is null or longitude is null then null
        else extensions.ST_SetSRID(
               extensions.ST_MakePoint(
                 longitude::double precision,
                 latitude::double precision
               ), 4326
             )::extensions.geography
      end
    ) stored;

comment on column public.developments.geo is
  'DERIVADA de latitude/longitude — nunca editar direto. Corrija lat/lng e o ponto acompanha. Ordem ST_MakePoint(longitude, latitude).';

-- Procedência da coordenada. Sem isto, "0 de 4 geocodificados" e "4 de 4
-- chutados" ficam indistinguíveis no dia seguinte.
alter table public.developments
  add column if not exists geo_fonte text,
  add column if not exists geo_confirmado_em timestamptz,
  add column if not exists geo_precisao_m numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'developments_geo_fonte_check'
  ) then
    alter table public.developments
      add constraint developments_geo_fonte_check
      check (geo_fonte is null or geo_fonte in ('manual', 'importado', 'api'));
  end if;

  -- Faixa global. NÃO pega latitude/longitude trocadas em São Paulo (-23,57 e
  -- -46,64 são ambas válidas nas duas ordens); pega dado corrompido de verdade.
  if not exists (
    select 1 from pg_constraint where conname = 'developments_latitude_faixa_check'
  ) then
    alter table public.developments
      add constraint developments_latitude_faixa_check
      check (latitude is null or (latitude >= -90 and latitude <= 90));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'developments_longitude_faixa_check'
  ) then
    alter table public.developments
      add constraint developments_longitude_faixa_check
      check (longitude is null or (longitude >= -180 and longitude <= 180));
  end if;

  -- Coordenada sem procedência é coordenada que ninguém sabe de onde veio.
  if not exists (
    select 1 from pg_constraint where conname = 'developments_geo_procedencia_check'
  ) then
    alter table public.developments
      add constraint developments_geo_procedencia_check
      check (
        (latitude is null and longitude is null)
        or (latitude is not null and longitude is not null and geo_fonte is not null)
      );
  end if;
end $$;

-- Opclass QUALIFICADA: com postgis em `extensions`, deixar o Postgres resolver
-- `gist(geo)` pelo search_path funciona na sessão do MCP e falha em quem aplicar
-- a migration com outro search_path.
create index if not exists developments_geo_gist
  on public.developments using gist (geo extensions.gist_geography_ops);

create index if not exists developments_regiao_idx
  on public.developments (organization_id, city, neighborhood);

-- ── 4. O CACHE DE GEOCODIFICAÇÃO ───────────────────────────────────────────
--
-- Chave = endereço NORMALIZADO, então "Rua Mário Amaral, 267" e
-- "rua mario amaral 267" são o MESMO registro e não geram duas consultas.
--
-- Escopo GLOBAL, sem organization_id, de propósito: um endereço aponta para o
-- mesmo lugar do planeta para toda imobiliária, e o objetivo declarado é "não
-- geocodificar novamente o mesmo endereço". Particionar por inquilino
-- multiplicaria as consultas pagas pelo número de inquilinos, que é o oposto do
-- pedido. Em troca, a tabela é service_role-only (RLS ligada, zero policy) e
-- NÃO deve receber endereço residencial de lead — ver o bloco 5.4 no cabeçalho.

create table if not exists public.geocode_cache (
  endereco_normalizado text primary key,
  endereco_original    text not null,
  latitude             numeric,
  longitude            numeric,
  geo extensions.geography(Point, 4326)
    generated always as (
      case
        when latitude is null or longitude is null then null
        else extensions.ST_SetSRID(
               extensions.ST_MakePoint(
                 longitude::double precision,
                 latitude::double precision
               ), 4326
             )::extensions.geography
      end
    ) stored,
  fonte                text not null,
  provedor             text,
  precisao_m           numeric,
  confirmado_em        timestamptz,
  consultas_evitadas   integer not null default 0,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint geocode_cache_fonte_check
    check (fonte in ('manual', 'importado', 'api')),
  constraint geocode_cache_latitude_faixa_check
    check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint geocode_cache_longitude_faixa_check
    check (longitude is null or (longitude >= -180 and longitude <= 180)),
  -- `provedor` só faz sentido quando a coordenada veio de API, e é OBRIGATÓRIO
  -- nesse caso: sem ele não há como saber a qual contrato o custo pertence.
  constraint geocode_cache_provedor_check
    check ((fonte = 'api' and provedor is not null) or (fonte <> 'api'))
);

comment on table public.geocode_cache is
  'Cache de geocodificação com chave no endereço normalizado, para que o mesmo endereço nunca seja consultado duas vezes. Fase 1 alimenta à mão/por importação; nenhuma API contratada. service_role-only.';
comment on column public.geocode_cache.consultas_evitadas is
  'Acertos de cache. É a métrica que justifica continuar: 0 depois de meses significa que o cache não serve para nada.';

alter table public.geocode_cache enable row level security;

revoke all on table public.geocode_cache from public;
revoke all on table public.geocode_cache from anon;
revoke all on table public.geocode_cache from authenticated;
grant select, insert, update, delete on table public.geocode_cache to service_role;

create index if not exists geocode_cache_geo_gist
  on public.geocode_cache using gist (geo extensions.gist_geography_ops);

-- ── 5. LEITURA DO CACHE — NUNCA GEOCODIFICAR O MESMO ENDEREÇO DUAS VEZES ───
--
-- ⚠ O OUT param se chama `endereco_chave`, NÃO `endereco_normalizado`. Chamá-lo
-- como a coluna faz o plpgsql abortar com 42702 "column reference is ambiguous"
-- dentro do `on conflict (endereco_normalizado)` da função de escrita — e o alvo
-- do ON CONFLICT não aceita qualificação (`on conflict (c.coluna)` é inválido).
-- MEDIDO: a função era CRIADA sem erro e só estourava na primeira CHAMADA. Ler o
-- SQL não pegava; executar pegou de primeira. Não renomeie de volta.

drop function if exists public.geocodificar_do_cache(text);

create or replace function public.geocodificar_do_cache(p_endereco text)
returns table (
  endereco_chave  text,
  latitude        numeric,
  longitude       numeric,
  fonte           text,
  confirmado_em   timestamptz,
  acerto_de_cache boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chave text := private.normalizar_endereco(p_endereco);
begin
  if v_chave is null then
    return;
  end if;

  -- Conta o acerto ANTES de devolver: `consultas_evitadas` é o número que
  -- justifica o cache existir, e só cresce quando ele de fato poupou a consulta.
  update public.geocode_cache c
     set consultas_evitadas = c.consultas_evitadas + 1
   where c.endereco_normalizado = v_chave
     and c.latitude is not null
     and c.longitude is not null;

  return query
    select c.endereco_normalizado, c.latitude, c.longitude, c.fonte,
           c.confirmado_em, true
      from public.geocode_cache c
     where c.endereco_normalizado = v_chave
       and c.latitude is not null
       and c.longitude is not null;
end;
$$;

comment on function public.geocodificar_do_cache(text) is
  'Devolve a coordenada já confirmada para o endereço, contando o acerto. Linha ZERO = precisa geocodificar; nunca inventa coordenada.';

revoke all on function public.geocodificar_do_cache(text) from public;
revoke all on function public.geocodificar_do_cache(text) from anon;
revoke all on function public.geocodificar_do_cache(text) from authenticated;
grant execute on function public.geocodificar_do_cache(text) to service_role;

-- ── 6. ESCRITA NO CACHE — PRECEDÊNCIA DA FONTE ────────────────────────────
--
-- "Permitir correção manual" e "não geocodificar novamente" só convivem com uma
-- regra de precedência EXPLÍCITA. Ela é: manual (3) > importado (2) > api (1).
--
--   · `manual` sempre grava — é a correção humana, e ela é soberana.
--   · fonte de precedência MENOR OU IGUAL à guardada NÃO sobrescreve. Sem o
--     "igual", um reprocessamento de API ficaria batendo na mesma linha para
--     sempre e o cache perderia a função.
--
-- Precedência implícita é a classe de bug que este repositório mais pagou (o
-- claim do JWT que ganhava do parâmetro e vazou dados entre empresas). Aqui ela
-- está escrita, e o contrato prova os DOIS lados.

drop function if exists public.geocode_cache_gravar(text, numeric, numeric, text, numeric, text);

create or replace function public.geocode_cache_gravar(
  p_endereco   text,
  p_latitude   numeric,
  p_longitude  numeric,
  p_fonte      text,
  p_precisao_m numeric default null,
  p_provedor   text default null
)
returns table (
  endereco_chave text,
  gravou         boolean,
  motivo         text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chave      text := private.normalizar_endereco(p_endereco);
  v_peso_novo  integer;
  v_peso_atual integer;
begin
  if v_chave is null then
    return query select null::text, false, 'endereco vazio';
    return;
  end if;

  if p_fonte is null or p_fonte not in ('manual', 'importado', 'api') then
    return query select v_chave, false, 'fonte invalida: ' || coalesce(p_fonte, 'null');
    return;
  end if;

  if p_latitude is null or p_longitude is null then
    return query select v_chave, false, 'coordenada incompleta';
    return;
  end if;

  v_peso_novo := case p_fonte
                   when 'manual' then 3
                   when 'importado' then 2
                   else 1
                 end;

  select case c.fonte when 'manual' then 3 when 'importado' then 2 else 1 end
    into v_peso_atual
    from public.geocode_cache c
   where c.endereco_normalizado = v_chave;

  -- Já existe coordenada de fonte igual ou mais forte: NÃO regeocodifica.
  if v_peso_atual is not null and v_peso_novo <= v_peso_atual and p_fonte <> 'manual' then
    return query select v_chave, false,
      'endereco ja confirmado por fonte de precedencia maior ou igual';
    return;
  end if;

  insert into public.geocode_cache (
    endereco_normalizado, endereco_original, latitude, longitude,
    fonte, provedor, precisao_m, confirmado_em, criado_em, atualizado_em
  )
  values (
    v_chave, p_endereco, p_latitude, p_longitude,
    p_fonte, p_provedor, p_precisao_m, now(), now(), now()
  )
  on conflict (endereco_normalizado) do update
    set endereco_original = excluded.endereco_original,
        latitude          = excluded.latitude,
        longitude         = excluded.longitude,
        fonte             = excluded.fonte,
        provedor          = excluded.provedor,
        precisao_m        = excluded.precisao_m,
        confirmado_em     = excluded.confirmado_em,
        atualizado_em     = now();

  return query select v_chave, true, 'gravado por fonte ' || p_fonte;
end;
$$;

comment on function public.geocode_cache_gravar(text, numeric, numeric, text, numeric, text) is
  'Grava coordenada no cache respeitando a precedência manual > importado > api. Devolve gravou=false com motivo quando recusa — nunca falha em silêncio.';

revoke all on function public.geocode_cache_gravar(text, numeric, numeric, text, numeric, text) from public;
revoke all on function public.geocode_cache_gravar(text, numeric, numeric, text, numeric, text) from anon;
revoke all on function public.geocode_cache_gravar(text, numeric, numeric, text, numeric, text) from authenticated;
grant execute on function public.geocode_cache_gravar(text, numeric, numeric, text, numeric, text) to service_role;

-- ── 7. DISTÂNCIA APROXIMADA, EM METROS DE VERDADE ─────────────────────────

create or replace function public.distancia_aproximada_m(
  p_lat_a numeric, p_lng_a numeric,
  p_lat_b numeric, p_lng_b numeric
)
returns numeric
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_lat_a is null or p_lng_a is null or p_lat_b is null or p_lng_b is null
      then null
    else extensions.ST_Distance(
           extensions.ST_SetSRID(extensions.ST_MakePoint(
             p_lng_a::double precision, p_lat_a::double precision), 4326)::extensions.geography,
           extensions.ST_SetSRID(extensions.ST_MakePoint(
             p_lng_b::double precision, p_lat_b::double precision), 4326)::extensions.geography
         )::numeric
  end;
$$;

comment on function public.distancia_aproximada_m(numeric, numeric, numeric, numeric) is
  'Distância em METROS sobre o esferoide WGS84 (geography). Conferida contra 1 grau de latitude = 110.574 m. Nunca geometry: lá o resultado sai em graus.';

revoke all on function public.distancia_aproximada_m(numeric, numeric, numeric, numeric) from public;
revoke all on function public.distancia_aproximada_m(numeric, numeric, numeric, numeric) from anon;
revoke all on function public.distancia_aproximada_m(numeric, numeric, numeric, numeric) from authenticated;
grant execute on function public.distancia_aproximada_m(numeric, numeric, numeric, numeric) to service_role;

-- ── 8. EMPREENDIMENTOS NUM RAIO ───────────────────────────────────────────
--
-- `p_organization_id` é OBRIGATÓRIO e a função é security definer — ela atravessa
-- a RLS por definição, então a cerca de inquilino tem de estar AQUI, escrita.
-- Sem isso, um raio de 50 km em São Paulo devolveria os empreendimentos de todas
-- as imobiliárias do banco.

create or replace function public.empreendimentos_no_raio(
  p_organization_id uuid,
  p_latitude        numeric,
  p_longitude       numeric,
  p_raio_m          numeric,
  p_limite          integer default 50
)
returns table (
  id           uuid,
  name         text,
  city         text,
  neighborhood text,
  latitude     numeric,
  longitude    numeric,
  distancia_m  numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, d.city, d.neighborhood, d.latitude, d.longitude,
         extensions.ST_Distance(
           d.geo,
           extensions.ST_SetSRID(extensions.ST_MakePoint(
             p_longitude::double precision, p_latitude::double precision
           ), 4326)::extensions.geography
         )::numeric as distancia_m
    from public.developments d
   where d.organization_id = p_organization_id
     and d.geo is not null
     and p_latitude is not null
     and p_longitude is not null
     and p_raio_m is not null
     and extensions.ST_DWithin(
           d.geo,
           extensions.ST_SetSRID(extensions.ST_MakePoint(
             p_longitude::double precision, p_latitude::double precision
           ), 4326)::extensions.geography,
           p_raio_m::double precision
         )
   order by distancia_m asc
   limit greatest(coalesce(p_limite, 50), 1);
$$;

comment on function public.empreendimentos_no_raio(uuid, numeric, numeric, numeric, integer) is
  'Empreendimentos da organização dentro do raio em METROS, do mais perto para o mais longe. Empreendimento sem coordenada NÃO entra (geo is not null) — ausência de dado nunca vira proximidade.';

revoke all on function public.empreendimentos_no_raio(uuid, numeric, numeric, numeric, integer) from public;
revoke all on function public.empreendimentos_no_raio(uuid, numeric, numeric, numeric, integer) from anon;
revoke all on function public.empreendimentos_no_raio(uuid, numeric, numeric, numeric, integer) from authenticated;
grant execute on function public.empreendimentos_no_raio(uuid, numeric, numeric, numeric, integer) to service_role;

-- ── 9. IMÓVEIS (UNIDADES) NUM RAIO ────────────────────────────────────────
--
-- A unidade herda o ponto do empreendimento — ver decisão (2) no cabeçalho.
-- `inner join` de propósito: unidade cujo empreendimento não tem coordenada não
-- aparece, em vez de aparecer com distância nula e parecer estar ao lado.

create or replace function public.imoveis_no_raio(
  p_organization_id uuid,
  p_latitude        numeric,
  p_longitude       numeric,
  p_raio_m          numeric,
  p_limite          integer default 100
)
returns table (
  id              uuid,
  title           text,
  development_id  uuid,
  development     text,
  city            text,
  neighborhood    text,
  status          text,
  distancia_m     numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.title, d.id, d.name, d.city, d.neighborhood, p.status,
         extensions.ST_Distance(
           d.geo,
           extensions.ST_SetSRID(extensions.ST_MakePoint(
             p_longitude::double precision, p_latitude::double precision
           ), 4326)::extensions.geography
         )::numeric as distancia_m
    from public.properties p
    join public.developments d on d.id = p.development_id
   where p.organization_id = p_organization_id
     and d.organization_id = p_organization_id
     and d.geo is not null
     and p_latitude is not null
     and p_longitude is not null
     and p_raio_m is not null
     and extensions.ST_DWithin(
           d.geo,
           extensions.ST_SetSRID(extensions.ST_MakePoint(
             p_longitude::double precision, p_latitude::double precision
           ), 4326)::extensions.geography,
           p_raio_m::double precision
         )
   order by distancia_m asc
   limit greatest(coalesce(p_limite, 100), 1);
$$;

comment on function public.imoveis_no_raio(uuid, numeric, numeric, numeric, integer) is
  'Unidades no raio, pelo ponto do EMPREENDIMENTO (unidade não tem endereço próprio). Medido em 2026-07-30: properties tem 0 linhas, então isto devolve vazio até o estoque entrar.';

revoke all on function public.imoveis_no_raio(uuid, numeric, numeric, numeric, integer) from public;
revoke all on function public.imoveis_no_raio(uuid, numeric, numeric, numeric, integer) from anon;
revoke all on function public.imoveis_no_raio(uuid, numeric, numeric, numeric, integer) from authenticated;
grant execute on function public.imoveis_no_raio(uuid, numeric, numeric, numeric, integer) to service_role;

-- ── 10. ORGANIZAR POR REGIÃO ──────────────────────────────────────────────
--
-- `geocodificados` vem separado de `total` DE PROPÓSITO: uma região com 3
-- empreendimentos e 0 coordenadas tem de aparecer como 3/0, não desaparecer nem
-- se passar por medida. Hoje TODAS as regiões estão 0 geocodificadas.

create or replace function public.empreendimentos_por_regiao(p_organization_id uuid)
returns table (
  regiao          text,
  cidade          text,
  total           bigint,
  geocodificados  bigint,
  centro_latitude numeric,
  centro_longitude numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(d.neighborhood, '(bairro não informado)') as regiao,
    coalesce(d.city, '(cidade não informada)')         as cidade,
    count(*)                                            as total,
    count(d.geo)                                        as geocodificados,
    case when count(d.geo) = 0 then null else
      extensions.ST_Y(
        extensions.ST_Centroid(
          extensions.ST_Collect(d.geo::extensions.geometry)
        )
      )::numeric
    end as centro_latitude,
    case when count(d.geo) = 0 then null else
      extensions.ST_X(
        extensions.ST_Centroid(
          extensions.ST_Collect(d.geo::extensions.geometry)
        )
      )::numeric
    end as centro_longitude
  from public.developments d
  where d.organization_id = p_organization_id
  group by 1, 2
  order by total desc, regiao asc;
$$;

comment on function public.empreendimentos_por_regiao(uuid) is
  'Empreendimentos agrupados por bairro/cidade, com quantos têm coordenada. total != geocodificados é informação, não erro a esconder.';

revoke all on function public.empreendimentos_por_regiao(uuid) from public;
revoke all on function public.empreendimentos_por_regiao(uuid) from anon;
revoke all on function public.empreendimentos_por_regiao(uuid) from authenticated;
grant execute on function public.empreendimentos_por_regiao(uuid) to service_role;

-- ── 11. CONCENTRAÇÃO DE DEMANDA — ONDE O CLIENTE QUER, NÃO ONDE ELE MORA ──
--
-- Duas fontes de sinal, informadas SEPARADAMENTE porque têm confiabilidade
-- muito diferente (medido em 2026-07-30):
--   · empreendimento de interesse (`leads.development_id`): 192 de 683 leads.
--   · bairro preferido (`leads.preferred_neighborhoods`):     6 de 683 leads.
--   · `preferred_regions`:                                    0 de 683 — a
--     coluna existe e está vazia; somá-la caladamente sugeriria cobertura que
--     não existe.
--
-- NENHUMA coordenada residencial entra aqui. Ver o bloco 5.4 no cabeçalho.
--
-- ⚠ O RECORTE QUE ESVAZIAVA A LISTA — corrigido, não repita. A primeira versão
-- tinha `and d.neighborhood is not null`, e com isso as 7 leads do "Spin Mood"
-- (único empreendimento com `neighborhood` NULL) DESAPARECIAM da concentração:
-- 192 com empreendimento entravam, 185 saíam, e nada dizia que 7 tinham sido
-- descartadas. Quem somasse a coluna acharia 185 e confiaria.
-- Agora bairro ausente vira a FAIXA '(bairro não informado)' — ausência de dado é
-- categoria própria, nunca sumiço. A identidade abaixo é contratada e testada:
--     soma(leads_por_empreendimento) == cobertura.com_empreendimento
-- Medido depois da correção: 192 == 192.

create or replace function public.concentracao_de_demanda_por_regiao(p_organization_id uuid)
returns table (
  regiao                     text,
  cidade                     text,
  leads_por_empreendimento   bigint,
  leads_por_bairro_preferido bigint,
  leads_total                bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with por_empreendimento as (
    select
      -- Sentinela em vez de NULL: agrupar por NULL some da lista.
      coalesce(private.normalizar_endereco(d.neighborhood), '(sem bairro)') as chave,
      coalesce(min(d.neighborhood), '(bairro não informado)')                as regiao,
      min(d.city)                                                           as cidade,
      count(*)                                                              as leads
    from public.leads l
    join public.developments d on d.id = l.development_id
    where l.organization_id = p_organization_id
    group by 1
  ),
  por_bairro as (
    select
      private.normalizar_endereco(b) as chave,
      min(b)                         as regiao,
      null::text                     as cidade,
      count(*)                       as leads
    from public.leads l
    cross join lateral unnest(l.preferred_neighborhoods) as b
    where l.organization_id = p_organization_id
      and private.normalizar_endereco(b) is not null
    group by 1
  )
  select
    coalesce(e.regiao, b.regiao)                as regiao,
    e.cidade                                    as cidade,
    coalesce(e.leads, 0)                        as leads_por_empreendimento,
    coalesce(b.leads, 0)                        as leads_por_bairro_preferido,
    coalesce(e.leads, 0) + coalesce(b.leads, 0) as leads_total
  from por_empreendimento e
  full outer join por_bairro b on b.chave = e.chave
  order by leads_total desc, regiao asc;
$$;

comment on function public.concentracao_de_demanda_por_regiao(uuid) is
  'Concentração de demanda pela região DESEJADA (empreendimento de interesse + bairro preferido). Nunca usa endereço residencial da lead — proibição do item 5.4. Empreendimento sem bairro entra como "(bairro não informado)", nunca desaparece: soma(leads_por_empreendimento) == cobertura.com_empreendimento.';

revoke all on function public.concentracao_de_demanda_por_regiao(uuid) from public;
revoke all on function public.concentracao_de_demanda_por_regiao(uuid) from anon;
revoke all on function public.concentracao_de_demanda_por_regiao(uuid) from authenticated;
grant execute on function public.concentracao_de_demanda_por_regiao(uuid) to service_role;

-- ── 12. A COBERTURA DO SINAL — O NÚMERO QUE IMPEDE A LEITURA OTIMISTA ─────
--
-- Sem isto, "Perdizes 174" parece o mapa da demanda da imobiliária, quando são
-- 174 de 683. Quem lê a concentração TEM de conseguir ler a cobertura no mesmo
-- lugar.

drop function if exists public.concentracao_de_demanda_cobertura(uuid);

create or replace function public.concentracao_de_demanda_cobertura(p_organization_id uuid)
returns table (
  leads_total                   bigint,
  com_empreendimento            bigint,
  com_empreendimento_sem_bairro bigint,
  com_bairro_preferido          bigint,
  com_regiao_preferida          bigint,
  sem_nenhum_sinal_de_regiao    bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*),
    count(l.development_id),
    -- A diferença entre `com_empreendimento` e o que chega a ter bairro nomeado.
    -- Sem este número, os 7 do Spin Mood viram '(bairro não informado)' na
    -- concentração e ninguém sabe QUANTOS eram nem POR QUÊ.
    count(*) filter (
      where l.development_id is not null
        and exists (
          select 1 from public.developments d
           where d.id = l.development_id and d.neighborhood is null
        )
    ),
    count(*) filter (
      where coalesce(cardinality(l.preferred_neighborhoods), 0) > 0
    ),
    count(*) filter (
      where coalesce(cardinality(l.preferred_regions), 0) > 0
    ),
    count(*) filter (
      where l.development_id is null
        and coalesce(cardinality(l.preferred_neighborhoods), 0) = 0
        and coalesce(cardinality(l.preferred_regions), 0) = 0
    )
  from public.leads l
  where l.organization_id = p_organization_id;
$$;

comment on function public.concentracao_de_demanda_cobertura(uuid) is
  'Quantas leads sustentam o mapa de demanda. MEDIDO na org 7c8c71c1 em 2026-07-30 04:19 UTC: 482 leads da org (483 no banco todo), 192 com empreendimento — das quais 7 em empreendimento sem bairro —, 6 com bairro preferido, 0 com regiao preferida, 290 sem sinal nenhum. Numeros por ORGANIZACAO, nao globais.';

revoke all on function public.concentracao_de_demanda_cobertura(uuid) from public;
revoke all on function public.concentracao_de_demanda_cobertura(uuid) from anon;
revoke all on function public.concentracao_de_demanda_cobertura(uuid) from authenticated;
grant execute on function public.concentracao_de_demanda_cobertura(uuid) to service_role;
