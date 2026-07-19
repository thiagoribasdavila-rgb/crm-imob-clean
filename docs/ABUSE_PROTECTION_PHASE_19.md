# Fase 19 — Proteção contra abuso

## Resultado

O limite em memória continua servindo como primeira barreira rápida, mas Meta, WhatsApp e envio externo agora também usam contador atômico no Postgres. Assim, reinícios ou múltiplos processos da Hostinger compartilham a mesma cota.

- Webhooks validam HMAC sobre o corpo bruto antes de interpretar o JSON.
- Eventos Meta repetidos permanecem protegidos pela chave externa única.
- Mensagens WhatsApp recebidas têm unicidade por organização, canal e ID externo; repetição retorna sucesso controlado sem recriar histórico ou aprendizado.
- O envio externo exige `Idempotency-Key`, vincula a chave ao hash da requisição e devolve a resposta anterior em uma repetição legítima.
- Reutilizar a mesma chave com conteúdo diferente retorna conflito.
- Operação simultânea com a mesma chave retorna “em processamento”.
- Falha do contador persistente fecha a operação com 503; não ignora silenciosamente a proteção.

As funções privilegiadas têm `search_path` vazio, execução revogada de usuários e concessão exclusiva ao `service_role`. A tabela do contador não é exposta a `anon` ou `authenticated`.

## Homologação externa

Aplicar primeiro no Supabase de homologação. Conferir duplicidades antigas em `messages.external_message_id` antes da migration. Testar duas instâncias Node concorrentes, replay idêntico, chave reutilizada com outro corpo, HMAC inválido, tempestade de webhook e limpeza periódica dos buckets expirados.
