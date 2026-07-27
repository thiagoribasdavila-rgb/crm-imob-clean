-- LIGA A VERSÃO DO CRIATIVO AO ANÚNCIO QUE ESTÁ NO AR.
--
-- ── O ELO QUE FALTAVA ───────────────────────────────────────────────────────
--
-- O Atlas já tem a estrutura de inteligência criativa inteira e bem governada:
-- brief com taxonomia fechada, versionamento, revisão obrigatória da diretoria,
-- fatos diários de desempenho, mínimo de 30 leads antes de qualquer afirmação e
-- proibição explícita de alegação causal.
--
-- E as quatro tabelas estão VAZIAS.
--
-- O motivo é um só: `creative_intelligence_versions` não tinha como dizer "eu
-- sou o anúncio 120251113236390624 na Meta". Sem esse campo, o desempenho só
-- entrava por digitação manual — e digitação manual de métrica diária não
-- acontece em operação nenhuma, nunca aconteceu aqui, e por isso
-- `creative_performance_daily_facts` nunca recebeu uma linha.
--
-- Enquanto isso, o dado do outro lado JÁ EXISTE: 21 leads desta base carregam
-- `metadata->>'ad_id'`, todas do mesmo criativo ("Heitor", campanha Spin Mood),
-- e nenhuma delas foi contatada. É uma informação que responde "qual peça traz
-- lead e o que acontece com ela depois" — e que não aparecia em lugar nenhum.
--
-- ── POR QUE ISTO DESTRAVA HOJE, SEM `ads_read` ──────────────────────────────
--
-- Gasto, impressões e cliques dependem da permissão que a conta de anúncios
-- ainda não concedeu. Mas leads, primeiro contato, visitas, propostas e vendas
-- são NOSSOS — estão no CRM. Com o elo, a metade que importa para decidir
-- criativo passa a ser mensurável sem depender de ninguém.
--
-- É inclusive a metade mais valiosa: CTR alto com lead que não fecha é criativo
-- ruim vestido de bom, e só o funil de baixo revela isso.

alter table public.creative_intelligence_versions
  add column if not exists external_ad_id text,
  add column if not exists external_platform text;

comment on column public.creative_intelligence_versions.external_ad_id is
  'Identificador do anúncio na plataforma (ad_id da Meta). É o elo com leads.metadata->>''ad_id'', que é como o funil real de cada peça fica mensurável.';

comment on column public.creative_intelligence_versions.external_platform is
  'Plataforma do anúncio: meta, google. Sem isto, dois anúncios com o mesmo id numérico em redes diferentes colidiriam.';

-- Um anúncio pertence a UMA versão de criativo. Sem esta restrição, dois
-- registros apontando para o mesmo anúncio dividiriam as leads entre si e as
-- duas leituras ficariam erradas — cada uma para menos.
--
-- Parcial porque a maioria das versões não tem anúncio no ar, e NULL não deve
-- colidir com NULL.
create unique index if not exists creative_versions_anuncio_unico
  on public.creative_intelligence_versions (organization_id, external_platform, external_ad_id)
  where external_ad_id is not null;

-- Busca pelo lado do anúncio: dado um ad_id vindo da lead, achar a peça.
create index if not exists creative_versions_por_anuncio
  on public.creative_intelligence_versions (organization_id, external_ad_id)
  where external_ad_id is not null;

-- Do outro lado da ponte: encontrar as leads de um anúncio sem varrer a tabela.
-- A expressão precisa ser idêntica à usada na consulta, senão o índice não é
-- escolhido pelo planejador.
create index if not exists leads_por_anuncio_meta
  on public.leads (organization_id, (metadata->>'ad_id'))
  where metadata->>'ad_id' is not null;
