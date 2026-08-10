# ATLAS 10X — Fase 8/24

## Ensaio dinâmico de RLS em clone isolado

### Objetivo

Comprovar a separação real entre organizações e a hierarquia comercial antes
de qualquer alteração no ambiente remoto. Esta fase entrega o pacote de
ensaio, não uma mudança de banco.

O teste cobre:

- acesso anônimo negado;
- corretor vendo apenas o próprio escopo;
- gerente vendo seu corretor descendente;
- diretor vendo a própria organização;
- negação nos dois sentidos entre duas organizações;
- rejeição de falsificação de responsável em `create_lead_atomic`;
- rejeição cross-tenant em `mutate_crm_project_v1`;
- RPCs de transferência e distribuição mantidas server-only;
- preservação das fixtures e `rollback` obrigatório.

### Por que GRANT e RLS são verificados separadamente

`GRANT` decide se o papel PostgreSQL alcança a tabela ou função. RLS decide
quais linhas esse papel pode ver depois de receber o privilégio. As duas
camadas precisam estar corretas.

Em 2026, o Supabase alterou o comportamento de exposição de novas tabelas:
novas tabelas públicas passam a exigir concessões explícitas para a Data API,
enquanto objetos existentes preservam os privilégios atuais. Por isso a Fase
8 captura ACLs e não presume defaults.

Referências oficiais:

- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/testing
- https://supabase.com/docs/guides/local-development/cli/testing-and-linting

### Contrato das fixtures

O clone restaurado e sanitizado deve conter duas organizações:

1. Organização A com diretor raiz, gerente subordinado, corretor subordinado
   ao gerente e uma lead desse corretor.
2. Organização B com um perfil ativo e uma lead atribuída a esse perfil.

O ensaio descobre essas referências dentro da transação. Nenhum UUID, nome,
e-mail, telefone, senha ou token é salvo na evidência. Se a estrutura mínima
não existir, o teste falha fechado e orienta preparar o clone.

### Arquivos

- Contrato:
  `config/atlas-10x-phase-008-isolated-rls-rehearsal.json`
- Snapshot somente leitura:
  `supabase/tests/fixtures/phase_008_acl_snapshot.sql`
- pgTAP dinâmico:
  `supabase/tests/database/phase_008_dynamic_rls_isolation.test.sql`
- Avaliador:
  `scripts/run-atlas-rls-isolated-rehearsal-phase-008.mjs`
- Executor:
  `scripts/execute-atlas-rls-isolated-rehearsal-phase-008.mjs`
- Gate:
  `scripts/check-atlas-rls-isolated-rehearsal-phase-008.mjs`

### Ordem operacional aprovada

1. Restaurar backup sanitizado em uma instância local/efêmera.
2. Confirmar que o banco responde apenas em loopback.
3. Definir na sessão:
   `app.atlas_rls_rehearsal_environment=isolated_clone`.
4. Executar o snapshot de ACL e salvar o JSON dentro do workspace.
5. Revisar o snapshot e confirmar que ele não contém dados pessoais.
6. Executar o ensaio com aprovação humana explícita.
7. Revisar a evidência sanitizada.
8. Só então preparar a correção candidata da Fase 9.

O executor rejeita:

- qualquer hostname diferente de `localhost`, `127.0.0.1` ou `::1`;
- ambiente diferente de `isolated_clone`;
- ausência de aprovação explícita;
- snapshot ausente ou incompatível;
- caminhos de evidência fora do workspace;
- execução por `--linked`.

### Comandos locais

Avaliar o pacote sem tocar em banco:

```bash
npm run atlas:rls-dynamic:assess
npm run atlas:rls-dynamic:check
```

O comando de execução existe, mas só funciona com todas as travas preenchidas:

```bash
ATLAS_RLS_REHEARSAL_ENVIRONMENT=isolated_clone \
ATLAS_RLS_REHEARSAL_APPROVED=true \
ATLAS_RLS_REHEARSAL_DATABASE_URL='postgresql://...@127.0.0.1:54322/postgres' \
ATLAS_RLS_REHEARSAL_ACL_SNAPSHOT_PATH='artifacts/runtime/phase-008-acl.json' \
npm run atlas:rls-dynamic:execute
```

Nunca inserir credenciais no Git, no chat ou na documentação.

### Critério para avançar à Fase 9

Todos os gates dinâmicos devem estar comprovados em clone isolado, o snapshot
deve ter sido revisado, a evidência deve permanecer sanitizada e o rollback
deve concluir sem resíduos. A Fase 9 poderá então preparar correções
controladas para homologação — ainda sem autorização automática para
produção.
