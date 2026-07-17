# Fase 33 — Movimentação segura

## Resultado

Cada mudança de etapa acontece em uma transação única. A função bloqueia a lead, confere organização, hierarquia, responsável e etapa esperada; depois altera status e registra movimento, timeline e evento técnico juntos.

## Concorrência e desfazer

Se outra pessoa movimentar a mesma lead, a segunda tentativa recebe conflito e precisa atualizar o Kanban. O desfazer referencia o movimento original e só funciona quando ele ainda é o evento mais recente, a lead permanece na etapa resultante e não existe reversão anterior.

## Homologação

Aplicar a migration e testar: avanço normal; corretor lateral; gerente paralelo; duas sessões movendo simultaneamente; desfazer imediato; desfazer repetido; desfazer depois de nova movimentação; compra externa sem motivo. Confirmar status, `pipeline_stage_moves`, `activities` e `atlas_events` após cada cenário.

Execute `npm run safe-movement:check`. Concorrência real no Supabase de homologação continua obrigatória.
