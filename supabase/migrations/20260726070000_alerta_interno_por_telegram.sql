-- =============================================================================
-- Canal de alerta interno: Telegram por corretor
-- =============================================================================
--
-- POR QUE ISTO EXISTE
-- O vigia de SLA cria tarefa no CRM quando o prazo de primeiro contato está
-- vencendo. Tarefa no CRM só é vista por quem abre o CRM — e o corretor que
-- está em visita, dirigindo ou em outra aba não abre. Medido em 2026-07-26:
-- 214 leads, 0 contatos registrados. O aviso precisa alcançar o telefone.
--
-- O WhatsApp Business está bloqueado (token da Meta não pertence ao Business
-- Manager do app) e, mesmo destravado, é canal de CLIENTE. Telegram é gratuito,
-- não depende de aprovação e serve ao que este caso precisa: falar com a EQUIPE.
--
-- O QUE ESTA MIGRATION FAZ
-- Uma coluna em profiles com o chat id do corretor no Telegram. Nada mais.
--
-- PRIVACIDADE, E ESTA PARTE NÃO É NEGOCIÁVEL
-- O chat id é identificador de terceiro, então fica sob a mesma RLS de profiles
-- que já vale para telefone e e-mail. E a mensagem enviada NÃO leva dado de
-- lead: vai a contagem, o prazo e um link para o CRM. Nome, telefone e e-mail
-- de cliente não saem da nossa infraestrutura por um canal de conveniência — é
-- a mesma regra do livro da carteira, que exibe "SEM PII" justamente por isso.
--
-- Coluna opcional: corretor sem chat id simplesmente não recebe alerta externo e
-- continua com a tarefa no CRM. Nada quebra por ausência.
-- =============================================================================

alter table public.profiles
  add column if not exists telegram_chat_id text;

comment on column public.profiles.telegram_chat_id is
  'Chat id do corretor no Telegram, para alerta interno de SLA. Opcional. A mensagem enviada nunca contém dado pessoal de lead.';

-- Um chat id por pessoa dentro da organização: dois perfis apontando para o
-- mesmo telefone fariam um corretor receber a fila do outro.
create unique index if not exists profiles_telegram_chat_id_uidx
  on public.profiles (organization_id, telegram_chat_id)
  where telegram_chat_id is not null;
