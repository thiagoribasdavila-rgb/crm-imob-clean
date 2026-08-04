-- UMA CONVERSA POR CORRETOR+CONTATO.
--
-- ── O que não existia ───────────────────────────────────────────────────────
--
-- Conferido no banco vivo em 02/08/2026: `conversations` tinha só
-- `conversations_pkey` (id) e `idx_conversations_org_updated` (não-único).
-- Nada impedia duas linhas com o MESMO `external_thread_id` na mesma
-- organização.
--
-- `messages` já era protegida assim — `uq_messages_external_delivery` sobre
-- (organization_id, channel, external_message_id). A conversa, que é a dona da
-- linha do tempo, ficou sem a mesma garantia.
--
-- ── Como isso quebrava, e por que crescia sozinho ───────────────────────────
--
-- A ponte de entrada procura a conversa por (organization_id,
-- external_thread_id). Duas mensagens chegando juntas passavam as duas pela
-- busca sem achar nada e inseriam duas conversas. A partir daí a busca
-- encontrava DUAS linhas — e `.maybeSingle()` trata "mais de uma" como ERRO.
-- O erro era descartado, a rota lia aquilo como "não existe conversa", e cada
-- mensagem seguinte abria mais uma. A linha do tempo do cliente se partia em
-- pedaços e o defeito se alimentava do próprio estrago.
--
-- O código da rota já foi corrigido para não depender deste índice (lê uma
-- lista com teto de 2, usa a mais antiga e denuncia a duplicidade no log).
-- Este índice é a outra metade: impedir que a duplicidade nasça.
--
-- ── NÃO APLICADA ────────────────────────────────────────────────────────────
--
-- Escrita e deixada aqui de propósito. `conversations` tem 0 linhas em
-- produção (medido em 02/08/2026), então a criação não pode falhar por dado
-- pré-existente — mas aplicar migration não estava autorizado nesta entrega.
-- Quem aplicar: rode primeiro a consulta de duplicatas ao final do arquivo.

create unique index if not exists uq_conversa_por_thread
  on public.conversations (organization_id, external_thread_id)
  where external_thread_id is not null;

comment on index public.uq_conversa_por_thread is
  'Uma conversa por (organizacao, thread externa). Sem isto, entregas simultaneas do WhatsApp criavam conversas paralelas e a busca por thread passava a falhar com multiplas linhas.';

-- ANTES DE APLICAR, confira que não há duplicata (precisa devolver 0 linhas):
--
--   select organization_id, external_thread_id, count(*)
--   from public.conversations
--   where external_thread_id is not null
--   group by 1, 2
--   having count(*) > 1;
