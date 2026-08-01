# ATLAS Meta — Fase 7/100

## Snapshot estrutural real, sanitizado e somente leitura

Esta fase comparou a especificação do bridge Meta com o catálogo do banco remoto. A coleta foi limitada a metadados do PostgreSQL: tabelas, views, RLS, policies, grants, índices e funções. Nenhuma linha comercial, lead, dado pessoal, segredo ou identificador do projeto foi lido ou preservado nos artefatos.

O resultado é deliberadamente fail-closed: esta evidência melhora o diagnóstico, mas não autoriza migration, deploy ou entrega de eventos reais.

## Resultado executivo

| Verificação | Resultado |
|---|---:|
| PostgreSQL | major 17 |
| Fontes canônicas | quatro fontes canônicas detectadas de quatro |
| Fontes canônicas com RLS | 4 de 4 |
| Objetos planejados do bridge | 0 de dez objetos |
| Helpers privados obrigatórios | 1 de 2 |
| Configuração real de schemas expostos pela Data API | não verificada |
| Cenários runtime entre tenants | não executados |
| Migration liberada | não |
| Produção liberada | não |

As fontes reais confirmadas são `public.crm_projects`, `public.marketing_campaigns`, `public.leads` e `public.profiles`. A coleta não consultou seus registros.

## Achados que bloqueiam a ativação

1. **O bridge ainda não está implantado.** Nenhum dos dez objetos-alvo da matriz de acesso foi encontrado. Isso inclui adapters de projetos e campanhas, credenciais privadas, outbox, dead letter e ledgers Meta.
2. **O helper `private.can_view_lead(uuid)` não existe.** Sem ele, o contrato de hierarquia Diretor → Gerente → Corretor não pode ser comprovado na camada de banco.
3. **`private.current_organization_id()` precisa de hardening.** A função é `SECURITY DEFINER`, exige sessão autenticada e não concede execução a `public` ou `anon`, mas usa `search_path` igual a `public, auth`. O contrato seguro exige `search_path` vazio e referências totalmente qualificadas.
4. **As quatro fontes canônicas mantêm grants CRUD legados para `anon`.** O snapshot também encontrou RLS habilitada e policies apenas para `authenticated`, portanto a RLS é a barreira de linhas observada hoje. Ainda assim, grants e RLS são camadas diferentes; o princípio de menor privilégio exige remover grants desnecessários em uma mudança separada, revisada e reversível.
5. **A exposição real da Data API não foi comprovada.** O artefato usa `public` somente como hipótese conservadora. A lista efetiva de schemas expostos deve ser confirmada pelo painel ou Management API antes de qualquer migration.
6. **O isolamento entre tenants ainda não foi testado em runtime.** Catálogo e policies não substituem testes com usuários reais de duas organizações distintas.

## O que esta fase não fez

- não criou ou alterou tabela, view, função, policy, grant ou índice;
- não executou migration;
- não consultou registros de negócio;
- não utilizou service role no cliente;
- não enviou eventos à Meta;
- não alterou campanha, orçamento ou público;
- não executou build.

## Evidências reproduzíveis

O coletor fica em `scripts/sql/meta-bridge-readonly-snapshot.sql`. O snapshot sanitizado fica em `config/fixtures/meta-bridge-remote-snapshot-sanitized.json`.

Para comparar a estrutura observada com o contrato:

```bash
npm run meta:phase-007:compare
```

Para validar a integridade da fase:

```bash
npm run meta:phase-007:check
```

## Decisão

**Estado: verificado com bloqueios.** A operação atual não foi modificada. O bridge, a migration e o deploy continuam bloqueados até que os grants, helpers, exposição da Data API e isolamento RLS tenham evidência suficiente.

## Próxima etapa — Fase 8/100

Preparar um clone de staging sem dados pessoais e executar a matriz de isolamento RLS com papéis reais:

- corretor da organização A não enxerga registros da organização B;
- gerente enxerga somente sua estrutura comercial;
- diretor enxerga o escopo autorizado da própria organização;
- `anon` não lê nem grava as fontes canônicas;
- `authenticated` não insere diretamente nos ledgers server-only;
- service role permanece restrita ao servidor e aos workers aprovados.

Somente depois desses testes será possível propor um plano SQL revisável. Aplicação no ambiente remoto continuará sendo uma decisão separada.

## Referências oficiais

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase — explicit grants for Data API tables](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Supabase — OpenAPI and anonymous schema access changes](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key)
