# ATLAS AI OS — Fase 15/24

## Pacote governado de migration isolada

Esta fase prepara o caminho entre um achado de segurança revisado e um ensaio local reproduzível. Ela não cria migrations, não executa SQL e não toca na homologação.

## O que precisa existir antes

1. Snapshot canônico da Fase 13, capturado em PostgreSQL 17 local/loopback.
2. Backlog íntegro da Fase 14, derivado desse mesmo snapshot.
3. Recibo humano com IDs aprovados, hashes do backlog e do snapshot, ticket opaco e revisão de rollback.
4. Escopo exato `isolated_loopback_pg17_only`.

A aprovação do ensaio não é autorização de produção, homologação ou qualquer projeto vinculado.

## Fluxo protegido

```text
snapshot canônico
        ↓ SHA-256
backlog determinístico
        ↓ SHA-256
recibo humano
        ↓ IDs + dependências
manifesto em memória
        ↓ revisão
scaffold com Supabase CLI
        ↓
ensaio PostgreSQL 17 local
```

Se qualquer elo faltar ou divergir, o fluxo termina bloqueado sem arquivo SQL.

## Supabase em 2026

- RLS e grants são controles independentes; ambos precisam ser validados.
- UPDATE requer leitura aplicável, `USING` e `WITH CHECK`.
- Políticas novas declaram papéis com `TO` e não usam `auth.role()`.
- Autorização não confia em `user_metadata`.
- Views expostas precisam de `security_invoker` ou devem sair da superfície da API.
- Funções `SECURITY DEFINER` exigem `search_path` fixo, nomes qualificados e `EXECUTE` mínimo; funções nascem executáveis por `PUBLIC` até que isso seja revogado.
- O fluxo oficial cria migrations com `supabase migration new <name>` e testa o histórico local antes de promover mudanças.

Referências oficiais:

- [Database migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [Deploying database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase CLI — db reset](https://supabase.com/docs/reference/cli/v0/supabase-db-reset)
- [Local development workflows](https://supabase.com/docs/guides/local-development/cli-workflows)

## Rollback seguro

Cada item recebe uma classe:

- `exact_reversible`: o estado anterior está capturado e pode ser restaurado sem reduzir a segurança.
- `containment_only`: desfazer reabriria exposição; a recuperação usa correção segura para frente.
- `manual_only`: policy, função ou dependência exige decisão e revisão humana.

O sistema nunca restaura automaticamente um grant anônimo, policy fraca, view privilegiada ou `EXECUTE` inseguro.

## Restrições do ensaio

- Somente PostgreSQL 17 local/loopback.
- Sem `--linked`, `--db-url`, `db push`, `migration repair` ou `apply_migration`.
- Sem leitura de `auth.users` ou linhas comerciais.
- Sem migrations para `CANONICAL_ENTITY_MISSING` ou `INVENTORY_INCOMPLETE`.
- Uma etapa de dependência por lote.
- Transação quando suportada, `lock_timeout`, `statement_timeout`, precondição, pós-condição e revisão de idempotência.
- Testes dinâmicos de RLS/grants e advisors antes de qualquer nova aprovação.

## Comandos seguros desta fase

```bash
npm run atlas:migration-package:assess
npm run atlas:migration-package:check
```

Esses comandos apenas avaliam artefatos locais e exercitam contratos sintéticos. Não criam migration.

## Estado atual

O contrato está pronto, mas faltam o snapshot canônico, o backlog derivado e o recibo de aprovação. Resultado esperado: bloqueio seguro, zero SQL executável e zero alteração de banco.
