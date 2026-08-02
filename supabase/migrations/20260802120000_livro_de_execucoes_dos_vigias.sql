-- LIVRO DE EXECUÇÕES DOS VIGIAS — uma linha por invocação, sempre.
--
-- ── O QUE ESTA TABELA RESOLVE ───────────────────────────────────────────────
--
-- Medido em 02/08/2026, lendo as 13 rotas que o agendador chama: NENHUMA delas
-- grava incondicionalmente. Toda escrita acontece dentro de um laço sobre uma
-- fila, ou dentro de uma RPC que só age quando há item elegível.
--
-- A consequência é que "tabela de efeito vazia" é AMBÍGUA. Ela pode significar
-- "o vigia nunca rodou" ou "o vigia rodou e corretamente não fez nada" — e o
-- portão `check-vigias-vivos` vinha publicando a primeira leitura como se fosse
-- fato, com a frase "NUNCA rodou". Alguns dos vigias que ele deu como mortos
-- podem ter funcionado perfeitamente.
--
-- Rastro condicional prova VIDA quando existe; a ausência dele não prova nada.
-- Para responder "este vigia rodou?" com honestidade é preciso um registro que
-- não dependa de ter havido trabalho. É o que esta tabela é.
--
-- ── POR QUE NÃO REAPROVEITEI UMA TABELA EXISTENTE ───────────────────────────
--
-- Eu cheguei a escrever, num commit anterior de hoje, que `atlas_agent_runs`
-- "seria o lugar natural" desse livro. Estava ERRADO, e a verificação pegou:
-- `app/api/v3/agents/process` seleciona dela `status='queued'`, trava a linha e
-- EXECUTA o que encontra. Inserir invocação de vigia ali faria a IA tentar rodar
-- o meu registro como se fosse tarefa dela. Não é questão de nome — é de
-- comportamento.
--
-- As outras candidatas também não servem, e por motivo de FORMA, não de gosto:
--   · integration_outbox            — fila de entrega, com claim e lock
--   · integration_health_snapshots  — snapshot agregado do sistema, não por vigia
--   · meta_executions               — chave de idempotência da Meta
--
-- Enfiar um segundo significado em qualquer uma delas é criar duas verdades
-- sobre a mesma tabela, que é a classe de defeito que este repositório mais
-- paga.
--
-- ── INCREMENTAL E REVERSÍVEL ────────────────────────────────────────────────
--
-- Tabela NOVA. Nada é alterado, nada é apagado, nenhum comportamento existente
-- muda. Sem nenhuma linha aqui o produto se comporta EXATAMENTE como hoje — a
-- ausência do livro significa "ainda não instalado", e o código que escreve nele
-- foi feito para dizer isso em voz alta em vez de falhar calado.
--
-- Rollback no fim do arquivo.

create table if not exists public.atlas_worker_runs (
  id uuid primary key default gen_random_uuid(),

  -- O nome do vigia como declarado em config/workers-schedule.json. Texto e não
  -- FK: a agenda vive no repositório, não no banco, e amarrar em FK obrigaria a
  -- uma segunda cópia dela aqui dentro.
  vigia text not null,
  rota text not null,

  -- Quem disparou. Hoje pode ser 'github-actions', 'crontab' ou 'manual', e é
  -- justamente essa pergunta que ninguém conseguia responder: a automação estava
  -- em zero e não havia como saber se era falta de agendador ou falta de
  -- trabalho.
  origem text not null default 'desconhecida',

  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz,
  duracao_ms integer,

  -- 'ok' = rodou e terminou. 'falhou' = terminou com erro.
  -- 'sem_trabalho' = rodou, olhou a fila e não havia nada — que é um desfecho
  -- LEGÍTIMO e é exatamente o que hoje se confunde com "nunca rodou".
  -- 'fora_da_janela' = a rota se recusou por horário; também é execução.
  desfecho text not null check (desfecho in ('ok', 'sem_trabalho', 'fora_da_janela', 'falhou')),

  -- O corpo que a rota devolveu, para quem precisar auditar depois. Sem dado de
  -- cliente: os vigias devolvem contadores, não conteúdo de mensagem.
  resposta jsonb not null default '{}'::jsonb,
  erro text,

  created_at timestamptz not null default now()
);

-- A pergunta quente é sempre a mesma: "quando este vigia rodou pela última
-- vez?". Índice descendente porque ninguém consulta o começo da série.
create index if not exists atlas_worker_runs_ultimo
  on public.atlas_worker_runs (vigia, iniciado_em desc);

-- Poda: o livro cresce sem parar. `outbox` roda a cada 2 minutos, o que dá
-- ~21.600 linhas por mês só dele. Este índice existe para a limpeza por idade
-- não varrer a tabela inteira.
create index if not exists atlas_worker_runs_idade
  on public.atlas_worker_runs (iniciado_em);

alter table public.atlas_worker_runs enable row level security;

-- ── FECHADA DE PROPÓSITO, E NÃO POR ACIDENTE ────────────────────────────────
--
-- RLS ligada sem policy já deixa a tabela deny-all para anon e authenticated.
-- Mas "sem policy" e "explicitamente revogada" são coisas diferentes: a primeira
-- depende de ninguém escrever uma policy depois sem pensar; a segunda é uma
-- decisão registrada.
--
-- O contrato `tests/contracts/rls-em-tabela-nova.test.mjs` reprovou a primeira
-- versão desta migration por isso, e estava certo: ele exige que uma tabela
-- deny-all esteja na quarentena SERVICE-ONLY, e o grupo SERVICE-ONLY cobra
-- justamente o REVOKE explícito. O portão me obrigou a fechar de verdade.
--
-- Este livro é infraestrutura: quem escreve são os vigias, que já rodam com
-- service_role (BYPASSRLS). Nenhum usuário final tem motivo para inserir uma
-- linha aqui — e uma linha falsa faria a operação PARECER viva, que é o oposto
-- do que a tabela existe para resolver.
revoke all on table public.atlas_worker_runs from public;
revoke all on table public.atlas_worker_runs from anon;
revoke all on table public.atlas_worker_runs from authenticated;
grant select, insert, delete on table public.atlas_worker_runs to service_role;

-- ── QUEM LÊ E QUEM ESCREVE ──────────────────────────────────────────────────
--
-- Escrita: SOMENTE service_role. Os vigias já rodam com ela, e nenhum usuário
-- final tem motivo para inserir uma linha de execução — uma linha falsa aqui
-- faria a operação parecer viva.
--
-- Leitura: service_role para os portões. Nenhuma policy para `authenticated`,
-- porque este livro não tem organization_id: ele é sobre o PROCESSO, não sobre
-- uma empresa, e dar leitura ampla vazaria o ritmo operacional entre inquilinos.
-- Quem precisar ver na tela consome pela rota, que já filtra.
--
-- Sem policy nenhuma, `authenticated` não lê nem escreve — que é o desejado.
-- service_role ignora RLS por construção.

comment on table public.atlas_worker_runs is
  'Uma linha por invocação de vigia, independente de ter havido trabalho. Existe porque nenhum dos 13 vigias grava incondicionalmente, e por isso "tabela de efeito vazia" não distingue "nunca rodou" de "rodou e não havia nada a fazer".';

comment on column public.atlas_worker_runs.desfecho is
  'sem_trabalho é desfecho LEGÍTIMO, não falha: o vigia acordou, olhou a fila e não achou nada. Confundir isso com ausência de execução foi o defeito que originou esta tabela.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- revoke all on table public.atlas_worker_runs from service_role;
-- drop index if exists public.atlas_worker_runs_idade;
-- drop index if exists public.atlas_worker_runs_ultimo;
-- drop table if exists public.atlas_worker_runs;
--
-- Derrubar não afeta nada além da observabilidade: nenhuma rota do produto lê
-- desta tabela para decidir comportamento, e o escritor degrada declarando que
-- o livro não está instalado.
