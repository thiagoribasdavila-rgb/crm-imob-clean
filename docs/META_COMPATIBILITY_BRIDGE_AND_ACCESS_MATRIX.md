# Atlas Meta Signal Intelligence — Fase 5/100

## Bridge de compatibilidade e matriz RLS/grants

**Resultado:** o contrato técnico de compatibilidade foi fechado e pode ser auditado automaticamente. A implantação continua bloqueada e nenhuma migration foi criada ou aplicada.

Esta fase remove uma ambiguidade crítica: o Atlas não criará cópias concorrentes de projetos, campanhas ou leads apenas para atender o módulo Meta. O bridge preserva a base viva e define exatamente quem pode ler ou escrever cada objeto.

## Fontes canônicas preservadas

| Domínio | Fonte ativa | Decisão |
| --- | --- | --- |
| Tenant | `private.current_organization_id()` | usar diretamente nas políticas; não publicar alias permissivo |
| Projetos | `public.crm_projects` | permanece como fonte de escrita e de IDs |
| Campanhas | `public.marketing_campaigns` | permanece como fonte de escrita e de IDs |
| Leads | `public.leads` | preservar IDs; sem backfill amplo nesta entrega |
| Perfis | `public.profiles` | somente evolução aditiva da hierarquia, em release posterior |

Não serão criadas tabelas duplicadas chamadas `developments` ou `campaigns`. Se a aplicação precisar dos nomes novos para leitura, poderá usar `developments_compat` e `campaigns_compat`, ambas somente leitura e com `security_invoker = true`. As chaves estrangeiras do kernel Meta devem continuar apontando para as tabelas canônicas, nunca para uma view.

## Contratos do bridge

### 1. Contexto de organização

- O `organization_id` é resolvido pela sessão autenticada, nunca aceito do navegador como fonte de verdade.
- Toda tabela exposta do ledger Meta filtra pelo tenant.
- Não criar um helper público que amplie a superfície de ataque.

### 2. Visibilidade de lead

O helper futuro `private.can_view_lead(uuid)` poderá centralizar a hierarquia comercial. Se precisar de `security definer`, deverá:

- exigir `auth.uid()` válido;
- conferir organização e hierarquia;
- usar `search_path` vazio e referências totalmente qualificadas;
- revogar execução de `PUBLIC` e `anon`;
- conceder execução a `authenticated` de modo explícito.

### 3. Projetos e campanhas

- Adapters somente leitura.
- Views obrigatoriamente `security_invoker`.
- RLS continua sendo aplicada nas tabelas de origem.
- Escritas continuam em `crm_projects` e `marketing_campaigns`.

### 4. Hierarquia e leads

- `commercial_role` e `reports_to` serão aditivos; nenhum papel atual será substituído.
- A ativação da hierarquia exige backfill revisado separadamente.
- O kernel Meta referencia `leads.id` sem reescrever em massa `assigned_to`, projeto, campanha ou metadata da base viva.

## Matriz RLS + grants aprovada para implementação

| Objeto | Data API | `anon` | `authenticated` | Escrita | Proteção |
| --- | --- | --- | --- | --- | --- |
| `developments_compat` | sim | nenhuma | `select` | nenhuma | view `security_invoker`; RLS na origem |
| `campaigns_compat` | sim | nenhuma | `select` | nenhuma | view `security_invoker`; RLS na origem |
| `integration_connections` | sim | nenhuma | `select` para liderança do tenant | servidor | RLS + metadata sem segredo |
| `private.integration_credentials` | não | nenhuma | nenhuma | servidor confiável | RLS defensiva + segredo fora da Data API |
| `private.integration_outbox` | não | nenhuma | nenhuma | worker confiável | fila privada e idempotente |
| `private.dead_letter_events` | não | nenhuma | nenhuma | worker confiável | quarentena privada |
| `meta_lead_sources` | sim | nenhuma | `select` no tenant e escopo do lead | ingestão no servidor | RLS por tenant + lead |
| `meta_lead_events` | sim | nenhuma | `select` no tenant e escopo do lead | ingestão no servidor | RLS por tenant + lead |
| `meta_conversion_configs` | sim | nenhuma | `select` para diretor/admin | comando administrativo no servidor | RLS por tenant + papel |
| `meta_conversion_events` | sim | nenhuma | `select` para liderança do tenant | servidor em modo de teste | RLS por tenant + papel |

Regras globais:

- `anon` não possui privilégio em nenhum objeto Meta operacional.
- Usuários autenticados não fazem `insert`, `update` ou `delete` direto nos ledgers.
- `service_role` existe somente no servidor e nunca no cliente.
- Filas e credenciais ficam em schema privado.
- Configuração visível ao CRM é separada de credenciais e tokens.

## Índices obrigatórios no futuro bundle

1. `(organization_id, created_at desc)` nos ledgers por tenant.
2. Índices de `lead_id` em eventos de lead e conversão.
3. Unicidade por organização + identificador externo do evento.
4. Índice parcial do outbox para eventos pendentes por `available_at`.
5. Índices de chaves estrangeiras.
6. Índices das colunas usadas nas políticas RLS.

## Por que a fonte atual ainda não pode ser aplicada

A auditoria de origem continua identificando diferenças entre migrations antigas e o alvo endurecido:

- outbox e dead letter foram originalmente planejados em `public`;
- configuração de integração precisa ser separada de credenciais;
- há função `security definer` com `search_path` não vazio;
- atribuição contém backfill amplo junto do DDL.

Portanto, os arquivos antigos servem como referência funcional, mas o bundle seguro deve ser reescrito em partes pequenas.

## Evidência oficial utilizada

O Supabase confirma que:

- RLS é obrigatória em tabelas expostas e deve ser combinada com grants mínimos: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- views comuns podem contornar RLS; no PostgreSQL 15+, `security_invoker = true` faz a view respeitar as políticas da origem.
- `service_role` e chaves secretas nunca devem chegar ao frontend: [Securing your data](https://supabase.com/docs/guides/database/secure-data).
- desde 30 de maio de 2026, novos projetos não expõem automaticamente novas tabelas; grants explícitos são necessários e independentes do RLS: [breaking change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## Estado da homologação

- Fontes canônicas: definidas.
- Bridge: especificado.
- Matriz RLS/grants: definida e testável.
- Migration: não criada.
- Banco alterado: não.
- Evento Meta real: não enviado.
- Produção: bloqueada.

## Próxima etapa — Fase 6/100

Criar um preflight executável para validar este contrato em ambiente isolado. Ele deverá falhar de forma fechada diante de tabela, coluna, helper, grant ou política divergente, antes de qualquer migration chegar ao banco de homologação.
