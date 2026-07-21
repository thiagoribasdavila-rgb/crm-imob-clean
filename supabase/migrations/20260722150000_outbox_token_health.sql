-- Saúde de token no outbox: coluna ADITIVA e nullable para distinguir a causa
-- de uma falha retryable. `token_unhealthy` marca eventos que falharam por
-- credencial expirada (Graph 190/463/467) — NÃO por dado do evento. Esses
-- eventos ficam retryable (sem consumir tentativa) até o token ser renovado,
-- em vez de irem a dead_letter. Uma leitura de readiness pode contar quantos
-- eventos estão presos por token para sinalizar "token precisa renovar".
--
-- Aditiva e reversível na prática: coluna nullable, sem default destrutivo,
-- sem tocar colunas/constraints existentes. Idempotente (if not exists).

begin;

alter table public.integration_outbox
  add column if not exists cause text;

comment on column public.integration_outbox.cause is
  'Causa da última falha retryable. token_unhealthy = credencial expirada (Graph 190/463/467): evento não consome tentativa e não vai a dead_letter até o token renovar. null = falha de dado normal.';

-- Índice parcial: readiness/observabilidade consultam só os presos por token.
create index if not exists integration_outbox_token_unhealthy_idx
  on public.integration_outbox(organization_id, available_at)
  where cause = 'token_unhealthy' and status in ('pending', 'failed');

commit;
