# ATLAS ONE — Fase 363 · Diretoria e isolamento da distribuição

## Objetivo

Garantir que somente a diretoria consiga consultar ou alterar a fila comercial,
mantendo o heartbeat como ação pessoal e preservando o isolamento completo por
organização em todas as leituras, configurações e atribuições.

## Falha corrigida

A ação `distribute` era processada antes da barreira explícita de diretoria no
endpoint. O RPC interno já fazia uma validação de liderança, mas também aceitava
gerente e superintendente. A combinação era funcional, porém não expressava a
política atual da operação em todas as camadas.

## Proteções implementadas

- a autorização de diretoria agora ocorre imediatamente após o heartbeat e antes
  de qualquer outra mutação, inclusive a distribuição imediata;
- a leitura da fila possui uma única política explícita de diretoria;
- ramificações mortas para gerente foram removidas do endpoint;
- ator e organização continuam derivados exclusivamente da sessão autenticada;
- todas as consultas críticas permanecem filtradas por `organization_id`;
- o RPC V4 agora exige novamente diretor ativo da mesma organização;
- o projeto é validado no mesmo tenant antes do algoritmo de distribuição;
- reservas superseded são limitadas à organização da chamada;
- o RPC continua revogado para `public`, `anon` e `authenticated`, com execução
  exclusiva pelo `service_role` do servidor.

## Arquivos alterados

- `app/api/v1/crm/distribution/route.ts`
- `supabase/migrations/20260810120000_phase_363_distribution_director_tenant_guard.sql`
- `tests/contracts/distribution-roster.test.mjs`
- `tests/contracts/distribution-tenant-isolation.test.mjs`

## Evidência local

- contratos da roleta e isolamento: 19/19 testes aprovados;
- TypeScript: aprovado;
- ESLint: aprovado, sem warnings;
- distribuição explicável: 9 critérios aprovados;
- prioridade de distribuição: aprovada;
- distribuição Meta da diretoria: aprovada;
- ciclos de valor: 10 ciclos e 50 fases contínuas aprovadas;
- varredura de segredos: 4.388 arquivos, zero credencial detectada.

## Estado da migration

`staged_local / remote_not_applied`

A migration é idempotente e está pronta para reconciliação controlada, mas não
foi aplicada ao Supabase remoto nesta fase. Nenhum dado, usuário, perfil,
organização, policy ou autenticação foi modificado.

## Estado da fase

`implemented_local / authenticated_runtime_proof_pending`

Nenhum build, ZIP ou deploy foi gerado isoladamente. A promoção permanece
condicionada à prova autenticada e à Fase 364, que mede tempo e equilíbrio antes
do fechamento do ciclo 360–364.
