# ATLAS AI OS — Fase 28/100

## Objetivo

Preparar o adaptador transacional durável e os rascunhos reversíveis do ledger da segunda amostra, sem conectá-los ao banco e sem emitir, consumir ou usar qualquer permissão.

## Problema resolvido

O ensaio em memória da Fase 27 comprovava a regra de um único vencedor, mas ainda não definia como essa garantia seria preservada entre processos, reinícios e concorrência real. A Fase 28 entrega o contrato técnico para essa persistência futura:

- ledger e auditoria em **schema privado**;
- isolamento obrigatório por organização;
- acesso direto revogado de `public`, `anon` e `authenticated`;
- chamada permitida somente ao servidor com `service_role`;
- função `security invoker`, sem escalada oculta de privilégio;
- RLS habilitado e forçado nas duas tabelas;
- reserva e registro de auditoria dentro de uma única transação RPC;
- unicidade para chave do ledger, nonce, idempotência e evento;
- colisões rejeitadas sem reaproveitar outra identidade;
- rollback que se recusa a remover um ledger com registros.

## Situação da migration

A Supabase CLI não está instalada neste ambiente. Por isso:

- nenhum nome oficial de migration foi inventado;
- nenhum arquivo foi incluído em `supabase/migrations/`;
- os SQLs permanecem em `supabase/migration-drafts/`;
- a promoção futura exige `supabase migration new`, revisão humana e clone isolado;
- migration: **não promovida e não executada**.

Essa separação segue o fluxo oficial de migrations do Supabase e evita que um rascunho entre acidentalmente na próxima implantação.

## Proteções do banco

O rascunho exige `app.atlas_meta_ledger_environment = staging_clone`. Sem isso, a transação para imediatamente.

O RPC de reserva:

1. valida organização, operador ativo, slot, revisão e validade;
2. tenta inserir a identidade com `ON CONFLICT DO NOTHING`;
3. se já existir, aceita apenas uma duplicata perfeitamente idêntica;
4. se algum fingerprint divergir, encerra com colisão;
5. quando a reserva é nova, grava o evento append-only na mesma transação;
6. não possui função de emissão, consumo ou entrega.

## Validação local

- 13 cenários comportamentais aprovados;
- 46 verificações estáticas aprovadas;
- erro de RPC: falha fechada;
- colisão de identidade: rejeitada;
- validade maior que cinco minutos: rejeitada;
- conexão de banco: não realizada;
- rede: não acessada.

## Limites desta fase

- migration: **não promovida e não executada**;
- rollback: **não executado**;
- reserva oficial: **não persistida**;
- permissão: **não emitida e não consumida**;
- evento Meta de teste ou real: **não enviado**;
- campanha, orçamento e público: **inalterados**;
- build: **não executado**;
- deploy: **não executado**;
- produção: **bloqueada**.

## Artefatos

- `lib/meta/meta-permit-ledger-adapter.mjs`
- `supabase/migration-drafts/phase_028_meta_permit_atomic_ledger.sql`
- `supabase/migration-drafts/phase_028_meta_permit_atomic_ledger.rollback.sql`
- `config/meta-repeatability-sample-02-durable-ledger-gate.json`
- `scripts/preflight-meta-repeatability-sample-02-durable-ledger.mjs`
- `scripts/audit-meta-repeatability-sample-02-durable-ledger.mjs`
- `config/meta-intelligence-phase-028.json`

## Próxima fase

A Fase 29 poderá promover e ensaiar a migration apenas em clone isolado e sanitizado, depois da instalação da Supabase CLI e de aprovação humana explícita. Aplicação remota, produção e entrega Meta continuam fora do escopo automático.
