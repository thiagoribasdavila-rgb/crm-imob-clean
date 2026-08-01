-- =============================================================================
-- ROLLBACK — 6.3 GRAFO DE OPORTUNIDADE DE RECEITA
-- =============================================================================
--
-- ⚠ ESTE ARQUIVO MORA EM `supabase/rollbacks/`, NUNCA DENTRO DE `migrations/`.
-- Um `.down.sql` ao lado da migration cria versão DUPLICADA no ledger e o
-- `db push` aborta no último arquivo. Já aconteceu neste repositório.
--
-- ── POR QUE O DESLIGAMENTO É BARATO ─────────────────────────────────────────
--
-- A frente inteira é LEITURA: views e funções sobre tabelas que já existiam.
-- Nada foi copiado, nenhuma coluna foi criada, nenhuma linha foi escrita. Então
-- derrubar isto não perde dado nenhum — perde apenas a capacidade de consultar.
-- É o "DESLIGAR: drop view" prometido no desenho, cumprido literalmente.
--
-- ── A ÚNICA COISA QUE MERECE ATENÇÃO ────────────────────────────────────────
--
-- `private.ator_alcanca_lead` é a cerca com ator explícito. Ela é NOVA (não
-- substituiu nada), e `private.can_access_lead_row` — a que a RLS usa — não foi
-- tocada por esta migration. Logo derrubar a função nova não afrouxa RLS
-- nenhuma: só faz as funções do grafo pararem de existir junto.
--
-- Confira antes de rodar, porque a resposta pode ter mudado desde 30/07:
--
--   select p.proname, pg_get_functiondef(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'private' and p.proname = 'ator_alcanca_lead';
--
-- Se alguma rota fora desta frente passou a chamá-la, o drop a quebra.
-- =============================================================================

begin;

-- As funções primeiro: elas dependem da cerca.
drop function if exists public.grafo_censo_de_prontidao(uuid);
drop function if exists public.grafo_demanda_x_oferta(uuid);
drop function if exists public.grafo_oportunidades_de_recuperacao(uuid, uuid, integer);
drop function if exists public.grafo_desempenho_de_campanha(uuid);
drop function if exists public.grafo_aptidao_do_corretor(uuid, uuid);
drop function if exists public.grafo_leads_semelhantes(uuid, uuid, integer);
drop function if exists public.grafo_empreendimentos_substitutos(uuid);
drop function if exists public.grafo_clientes_para_empreendimento(uuid, uuid, integer);

-- As views: independentes entre si, nenhuma view sobre view.
drop view if exists public.vw_grafo_censo_de_arestas;
drop view if exists public.vw_grafo_oferta;
drop view if exists public.vw_grafo_demanda;

-- A cerca por último. Ver o aviso do cabeçalho antes de descomentar: se outra
-- frente passou a usá-la, este drop derruba aquela frente também. Deixada
-- comentada de propósito — função órfã não custa nada e não abre nada, enquanto
-- um drop apressado numa função de CERCA custa caro.
-- drop function if exists private.ator_alcanca_lead(uuid, uuid, uuid, uuid);

commit;
