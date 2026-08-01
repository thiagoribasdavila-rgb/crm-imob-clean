# Fase 74 — Histórico de origem e atribuição

A primeira origem torna-se imutável. Cada campanha, mudança de fonte ou registro manual acrescenta um toque à jornada, com canal, projeto e identificadores de campanha, conjunto, anúncio, formulário e página quando disponíveis.

O fluxo é idempotente, auditável, sem dados pessoais e respeita a hierarquia. Leads antigas recebem backfill da melhor informação histórica disponível.

## Homologação

Aplicar a migration; testar lead manual, Meta completa, mudança de campanha, entrega repetida, toque manual, backfill, first/last pointers, quatro perfis e dois tenants. Confirmar que o primeiro toque nunca muda.
