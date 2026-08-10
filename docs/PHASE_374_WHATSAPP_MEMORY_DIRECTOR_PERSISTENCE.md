# Fase 374 — persistência pronta para reconciliação

O ledger de decisão da memória comercial está incluído como migration idempotente e append-only. A release não aplica a migration remotamente, não executa reset e não altera usuários, organização ou dados atuais.

Antes de liberar escrita, compare as migrations locais com o projeto Supabase correto e aplique somente a migration pendente pelo processo operacional aprovado. Enquanto a tabela ou RPC não existir, a API retorna `persistenceReady: false` e a interface permanece bloqueada.

Validação local:

```bash
npm run whatsapp-memory-director-persistence-ready:check
```
