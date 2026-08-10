# ATLAS AI OS — Fase 6/24

## Hardening de policies, grants e funções privilegiadas

Data da auditoria: 23 de julho de 2026  
Ambiente observado: `atlas-v3-homologacao`  
Modo desta fase: somente leitura e preparação local

## Objetivo

Reduzir a superfície de acesso do Supabase antes de provisionar usuários ou liberar operação real. Esta fase separa três perguntas que não podem ser confundidas:

1. o objeto está acessível pela Data API?
2. se estiver acessível, quais linhas o RLS permite enxergar?
3. se for uma função privilegiada, quem pode executá-la diretamente?

Grants e RLS são camadas diferentes. Uma tabela com RLS ligado e sem policy bloqueia linhas por padrão, mas o aviso do advisor indica que seu contrato ainda não está explícito e testado. O achado, isoladamente, não prova exposição direta: para isso também é necessário confirmar os grants efetivos do catálogo.

## Evidência remota confirmada

| Achado | Quantidade | Consequência |
|---|---:|---|
| RLS ativo sem policy | 12 tabelas | contrato de acesso incompleto ou objeto intencionalmente server-only ainda não documentado |
| `SECURITY DEFINER` executável por `anon` | 3 funções | risco confirmado de chamada direta sem autenticação |
| `SECURITY DEFINER` executável por `authenticated` | 10 funções | exige classificação função por função; nem toda execução autenticada é incorreta |
| Snapshot detalhado de ACL do catálogo | indisponível | impede afirmar quais das 12 tabelas têm grants diretos |

O snapshot sanitizado está em
`config/atlas-10x-phase-006-remote-security-snapshot.json`.

## Tabelas sem policy

As 12 tabelas foram colocadas em `default deny` lógico até haver decisão explícita:

- `ai_conversations`
- `ai_learning_events`
- `ai_messages`
- `ai_tool_calls`
- `ai_usage`
- `api_rate_limit_buckets`
- `knowledge_chunks`
- `lead_identity_registry`
- `lead_scores`
- `projects`
- `user_provisioning_failures`
- `users`

Para cada tabela, a fase 7 deve escolher uma destas classes:

- `server_only`: sem acesso direto para `anon` ou `authenticated`;
- `tenant_read`: leitura autenticada com `organization_id` e escopo hierárquico;
- `tenant_write`: escrita autenticada somente por comando governado e policies completas;
- legado a aposentar: consumidor migrado, acesso revogado e remoção tratada em fase posterior, nunca nesta fase.

Nenhuma policy genérica foi inventada porque nem todas as tabelas têm o mesmo modelo de `organization_id`, propriedade ou visibilidade.

## Funções privilegiadas

### Gatilhos antigos

Três funções existem apenas para serem chamadas por triggers:

- `apply_opportunity_commission_sla()`
- `refresh_commission_status()`
- `scaffold_project_intelligence()`

As implementações locais qualificam relações como `public.<tabela>`, mas ainda usam `search_path=public` e não revogam execução direta. A proposta da fase:

- revoga `EXECUTE` de `public`, `anon` e `authenticated`;
- mantém `service_role`;
- endurece o `search_path` para vazio;
- não remove nem altera os triggers.

Revogar execução direta de uma função de trigger não impede que o trigger vinculado a execute.

### RPCs de negócio

- `create_lead_atomic(...)` já valida `auth.uid()`, organização e propriedade do lead, mas ainda precisa de ensaio com `search_path` endurecido.
- `mutate_crm_project_v1(...)` já valida ator, tenant e papel por helpers privados; a execução autenticada só será aprovada após a matriz real de papéis.
- `distribute_project_leads(...)` é `service_role` no contrato local, enquanto o advisor remoto reporta execução por `authenticated`. A divergência precisa ser corrigida e comprovada.

### Helpers

`current_organization_id()`, `current_user_role()`, `effective_distribution_rule(...)` e `search_knowledge_chunks(...)` precisam de mapa de consumidores. Helpers de policy podem exigir execução autenticada, mas devem preferencialmente residir em schema não exposto e nunca confiar em parâmetros de tenant fornecidos pelo cliente sem validação.

## Proposta SQL reversível

O arquivo
`scripts/sql/phase-006-rls-grants-functions-hardening-proposal.sql`
é deliberadamente não aplicável:

- abre transação;
- registra as 12 decisões como `unresolved`;
- falha fechado enquanto houver decisão pendente;
- contém apenas o hardening inequívoco dos três triggers e o retorno da distribuição ao contrato `service_role`;
- não contém `DROP TABLE`, `TRUNCATE` ou exclusão de dados;
- termina em `ROLLBACK`;
- não contém `COMMIT`.

Ele é uma especificação executável para o ensaio isolado da fase 7, não uma migration.

## Gates para aplicação

A migration remota só poderá nascer depois de:

1. obter ACLs efetivas de tabelas e funções;
2. classificar as 12 tabelas;
3. ensaiar anon, corretor, gerente, superintendente, diretor e servidor;
4. provar negação entre tenants;
5. provar bloqueio contra falsificação de `actor_id` e `organization_id`;
6. revisar planos de consulta das policies;
7. obter recibo de backup e restauração;
8. ensaiar rollback;
9. zerar os advisors aplicáveis;
10. receber aprovação humana explícita.

## Referências oficiais

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing your data](https://supabase.com/docs/guides/database/secure-data)
- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Database Linter: RLS enabled without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Database Linter: anonymous SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Database Linter: authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

## Próxima fase

Fase 7/24 — ensaio isolado de RLS e matriz real de acesso. Ela converterá as classificações aprovadas em testes negativos e positivos antes de qualquer alteração no Supabase remoto.
