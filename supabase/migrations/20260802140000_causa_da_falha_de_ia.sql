-- A CAUSA DA FALHA DE IA — colunas para responder "por que ela não respondeu?".
--
-- ⚠ ESTA MIGRATION NÃO FOI APLICADA. Escrita e deixada no repositório de
--   propósito; o código que a acompanha funciona SEM ela (degrada declarando) e
--   passa a gravar a causa assim que ela for aplicada.
--
-- ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
--
-- Medido no banco de produção em 02/08/2026:
--
--   ai_orchestration_decisions com 'openai' na ordem ..... 48
--   ai_orchestration_decisions que ESCOLHERAM openai .....  0
--   ai_usage_events com provider='openai' ................  0
--   ai_orchestration_decisions com status='failed' .......  0
--
-- A OpenAI foi tentada 48 vezes e não atendeu uma única vez. O `copilot` caiu no
-- fallback determinístico 13 vezes seguidas — o corretor recebeu texto genérico
-- e ninguém consegue dizer se foi chave vencida, cota estourada ou rede fora.
-- A única frase com a causa real é a linha `ai.provider_failover` no PM2 da
-- Hostinger, que ninguém da operação alcança.
--
-- ── O CHECK JÁ PREVIA 'failed'. O CÓDIGO NUNCA GRAVOU UM ────────────────────
--
-- ai_orchestration_decisions_status_check já aceita
-- ('planned','completed','fallback','failed') — a tabela foi DESENHADA para
-- registrar falha. `recordOrchestration()` só sabia escrever 'completed' ou
-- 'fallback', então 'failed' ficou com zero linha desde sempre.
--
-- E 'fallback' é AMBÍGUO da forma mais cara possível: ele significa tanto "todos os
-- provedores falharam e sobrou o determinístico" quanto "o plano legitimamente
-- escolheu o local". Duas situações opostas — uma é incidente, a outra é o
-- sistema funcionando — gravadas com a mesma palavra.
--
-- ── POR QUE AQUI, E NÃO EM ai_usage_events ─────────────────────────────────
--
-- Foi a primeira ideia e está ERRADA. Medido lendo os consumidores da tabela:
--
--   · public.consumo_de_ia_do_dia faz count(*) em ai_usage_events para aplicar
--     o TETO DIÁRIO. Cada falha viraria uma chamada gasta, e um failover
--     (openai falha → perplexity atende) contaria DUAS por uma ação do usuário.
--     A IA apertaria o próprio teto a cada erro até se trancar sozinha — o mesmo
--     laço que o código já documenta e evita no caminho de recusa por teto.
--   · app/api/v1/ready monta `provedoresComRespostaReal` a partir de
--     ai_usage_events. Uma linha de falha com provider='openai' faria a tela de
--     prontidão AFIRMAR que a OpenAI respondeu. Exatamente ao contrário.
--   · governance/reliability-gate calcula percentil de latência dali. Latência de
--     chamada que não serviu ninguém não é latência de atendimento.
--
-- Consumo é o que gastou e serviu. Falha não é consumo — é desfecho. Por isso
-- ela mora na tabela de DECISÃO, que já existe para explicar o roteamento.
--
-- ── INCREMENTAL E REVERSÍVEL ────────────────────────────────────────────────
--
-- Só ADD COLUMN, todas nuláveis, nenhuma com default que reescreva linha antiga.
-- Nada é alterado, nada é apagado, nenhum comportamento existente muda. As 55
-- linhas já gravadas continuam válidas e passam a ter as colunas em NULL, que
-- lê-se como "gravada antes de existir registro de causa" — e não como "sem
-- falha". A distinção está no comentário de coluna, abaixo.
--
-- Rollback no fim do arquivo.

alter table public.ai_orchestration_decisions
  -- Classe da causa, não a frase. É o que traduz falha em AÇÃO: credencial e
  -- cota são do DONO da conta, configuração é do TIME TÉCNICO, rede não é de
  -- ninguém. Guardar só a mensagem devolveria a pergunta ao operador.
  add column if not exists error_class text
    check (error_class is null or error_class in (
      'credencial', 'cota', 'rede', 'configuracao',
      'recusa_do_modelo', 'politica_interna', 'cancelada', 'desconhecida'
    )),

  -- Código curto do provedor quando existir: insufficient_quota, invalid_api_key,
  -- model_not_found, ETIMEDOUT, HTTP 429.
  add column if not exists error_code text,

  -- A mensagem do provedor, JÁ REDIGIDA por lib/ai/falha-de-ia.ts (chave, bearer,
  -- JWT e e-mail trocados por marcador) e limitada a 500 caracteres. Segredo não
  -- entra aqui: esta coluna é lida por tela de operação.
  add column if not exists error_message text,

  -- Uma entrada por provedor TENTADO e falho, na ordem em que foram tentados:
  -- [{"provedor":"openai","classe":"cota","codigo":"insufficient_quota", ...}]
  -- Sem isto, um failover bem-sucedido apaga a falha que houve no caminho — que
  -- é como 48 falhas de OpenAI ficaram invisíveis atrás de respostas da
  -- Perplexity.
  add column if not exists provider_attempts jsonb,

  -- A frase de QUEM destrava, derivada da classe. Fica gravada junto para que a
  -- tela não precise reimplementar a tradução e divergir dela depois — a classe
  -- de bug "duas verdades" que este repositório mais paga.
  add column if not exists who_resolves text;

-- A pergunta quente: "quais falhas, de que classe, nos últimos dias?". Parcial
-- porque a esmagadora maioria das linhas não tem falha, e um índice cheio delas
-- só ocuparia página à toa.
create index if not exists ai_orchestration_decisions_falhas
  on public.ai_orchestration_decisions (error_class, created_at desc)
  where error_class is not null;

comment on column public.ai_orchestration_decisions.error_class is
  'Classe da causa da falha. NULL significa "sem falha registrada", e nas linhas anteriores a 02/08/2026 significa "gravada antes de existir registro de causa" — que NÃO é o mesmo que "não falhou". As 48 tentativas de OpenAI que falharam antes desta coluna são justamente linhas com error_class NULL.';

comment on column public.ai_orchestration_decisions.provider_attempts is
  'Provedores tentados e falhos, em ordem. Existe porque failover bem-sucedido escondia a falha do caminho: a Perplexity respondia e as 48 falhas da OpenAI não deixavam rastro nenhum no banco.';

comment on column public.ai_orchestration_decisions.status is
  'planned | completed | fallback | failed. ATENÇÃO: até 02/08/2026 o código nunca gravou "failed", e usava "fallback" tanto para "todos os provedores falharam" quanto para "o plano escolheu o local de propósito" — incidente e operação normal com a mesma palavra. error_class é o que agora separa os dois.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- drop index if exists public.ai_orchestration_decisions_falhas;
-- alter table public.ai_orchestration_decisions
--   drop column if exists who_resolves,
--   drop column if exists provider_attempts,
--   drop column if exists error_message,
--   drop column if exists error_code,
--   drop column if exists error_class;
--
-- Derrubar volta ao estado de hoje e não afeta o produto: nenhuma rota decide
-- comportamento por estas colunas, e o escritor em lib/ai/provider-router.ts
-- detecta a ausência delas e continua gravando o payload base, do mesmo jeito
-- que já faz com as colunas de cache em ai_usage_events.
