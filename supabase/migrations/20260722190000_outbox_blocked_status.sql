-- O valor 'blocked' é ESCRITO hoje por dois caminhos e o CHECK da tabela não o
-- admite. integration_outbox nasceu com
-- check (status in ('pending','processing','delivered','failed','dead_letter'))
-- em 20260711060000_atlas_level6_resilience.sql:25, e desde então:
--
--   1) public.register_whatsapp_opt_out (20260717014400) faz
--      `update public.integration_outbox set status='blocked'` quando o cliente
--      manda PARE. Se houver mensagem enfileirada para aquele contato, o UPDATE
--      viola o CHECK (23514), a função inteira aborta na mesma transação — e com
--      ela o insert em messaging_suppressions. app/api/webhooks/whatsapp/route.ts:96
--      faz `throw optOutError`, o webhook devolve 500 e a Meta reenvia em loop.
--      O pedido de PARE do cliente NÃO fica registrado. Isso é risco regulatório,
--      não só de fila.
--
--   2) app/api/v2/outbox/process/route.ts fecha em 'blocked' o evento suprimido
--      por opt-out antes do envio. O UPDATE é rejeitado, o evento fica preso em
--      'processing' para sempre e some de toda contagem (não é fila, não é falha).
--
-- Ampliar o domínio de um CHECK é aditivo: nenhuma linha existente vira inválida
-- (o conjunto novo contém o antigo) e nada é reescrito. Idempotente: sai cedo se
-- a tabela não existe e não faz nada se o valor já for aceito.

do $$
begin
  if to_regclass('public.integration_outbox') is null then
    return;
  end if;

  -- Já admite 'blocked'? (compara a expressão do CHECK, não o nome.)
  if exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.integration_outbox'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%blocked%'
  ) then
    return;
  end if;

  alter table public.integration_outbox
    drop constraint if exists integration_outbox_status_check;

  alter table public.integration_outbox
    add constraint integration_outbox_status_check
    check (status in ('pending','processing','delivered','failed','blocked','dead_letter'));
end $$;

-- O comentário também precisa do guard de existência: solto, ele derrubava a
-- migration inteira no banco que ainda não tem a tabela (medido com Postgres
-- real antes de subir).
do $$
begin
  if to_regclass('public.integration_outbox') is null then
    return;
  end if;

  execute $c$comment on column public.integration_outbox.status is
    'pending/failed = retryable (o worker relê). processing = com lease de worker. delivered = entregue. blocked = encerrado SEM entrega por decisão de governança (opt-out, lease expirado sem prova de entrega) — terminal e nunca reenviado automaticamente. dead_letter = esgotou tentativas.'$c$;
end $$;
