# Atlas Meta Signal Intelligence — Fase 4/100

## Plano seguro de compatibilidade do schema Meta

**Resultado:** plano concluído, implantação bloqueada por segurança e nenhuma alteração aplicada ao banco ou à Meta.

Esta fase responde a uma pergunta objetiva: **qual é o menor caminho seguro para conectar os sinais comerciais do Atlas ao Meta sem colocar leads, autenticação ou isolamento entre empresas em risco?**

## Diagnóstico confirmado

- O banco ativo possui dados comerciais reais e não pode receber uma sequência local de migrations às cegas.
- O ledger remoto tem 33 migrations aplicadas; o repositório contém 123 arquivos. Existem **90 migrations** ainda não reconciliadas.
- O banco ativo usa `crm_projects` e `marketing_campaigns`, enquanto migrations mais novas esperam `developments` e `campaigns`.
- O helper de tenant ativo está em `private.current_organization_id`; parte do código pendente espera helpers no schema `public` e também depende de `private.can_view_lead`.
- O kernel Meta ainda não existe integralmente no banco ativo: ingestão, outbox, conversões, atribuição e ciclo Andromeda continuam incompletos.
- Duas migrations antigas criam tabelas e RLS sem completar grants/revokes explícitos. No modelo atual do Supabase, **RLS + grants** precisam ser validados juntos.
- A função de decisão do ciclo Andromeda não usa o `search_path` vazio exigido pelo padrão endurecido adotado para funções `security definer`.

## Decisão arquitetural

**Não aplicar** as 90 migrations pendentes em sequência e não reutilizar migrations amplas como se fossem um pacote único.

O caminho aprovado para desenvolvimento é criar seis entregas pequenas:

1. **Preflight de schema:** somente assertions, falhando de forma fechada diante de qualquer coluna, helper ou tabela desconhecida.
2. **Bridge de compatibilidade:** resolver helpers de tenant, hierarquia e nomes canônicos sem substituir as tabelas vivas.
3. **Kernel de outbox:** fila tenant-safe, idempotente, com escrita apenas no servidor e grants explícitos.
4. **Kernel de ingestão Meta:** origem e eventos de lead com deduplicação e trilha de evidência.
5. **Kernel de conversões:** ledger restrito ao modo de teste, sem envio de produção.
6. **Atribuição e aprendizado:** release posterior; DDL separado do backfill e aprendizagem liberada somente após resultados reais supervisionados.

## Por que as migrations atuais não podem ser aplicadas diretamente

| Bloco | Problema | Tratamento seguro |
| --- | --- | --- |
| Resiliência/outbox | helper público ausente e grants incompletos | extrair um kernel menor e endurecido |
| Automação de marketing | migration ampla e dependência de `campaigns` | extrair apenas o subconjunto Meta |
| Lead closed loop | depende de `integrations` e helper compatível | aplicar somente depois do bridge |
| Conversões | depende do kernel de ingestão | aplicar em ordem e permanecer test-only |
| Atribuição | depende de projetos, campanhas, colunas e helpers ausentes; contém backfill amplo | separar DDL e backfill em lotes |
| Learning loop | ainda não há evidência operacional suficiente | manter bloqueado até resultados reais |

## Segurança obrigatória

- RLS em toda tabela exposta pela Data API.
- Grants explícitos; `anon` sem acesso por padrão.
- Escritas do outbox e dos ledgers Meta restritas ao `service_role` no servidor.
- Funções `security definer` com `search_path` fixo e execução pública revogada.
- Teste cruzado de tenant antes da homologação.
- Nenhuma chave, identificador de ativo ou dado pessoal em relatórios.

O Supabase documenta que grants controlam o acesso à tabela e RLS controla as linhas. Ambos devem fazer parte do mesmo gate: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api). A responsabilidade por backups, recuperação e proteção de credenciais também permanece compartilhada com o projeto: [Shared Responsibility Model](https://supabase.com/docs/guides/deployment/shared-responsibility-model). Desde abril de 2026, novas tabelas `public` também não são automaticamente expostas pela Data/GraphQL API, reforçando a necessidade de grants explícitos: [breaking change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## Gates antes de qualquer aplicação

1. Backup recente disponível.
2. Restauração ensaiada e evidenciada.
3. Dry-run em clone de homologação.
4. Preflight de schema aprovado.
5. Matriz RLS/grants aprovada.
6. Advisors de segurança sem erro do novo bundle.
7. Contagens e checksums preservados.
8. rollback ensaiado.
9. Aprovação do diretor registrada.

## Estratégia de rollback

1. Desligar feature flags Meta.
2. Parar consumidores do outbox.
3. Retornar a aplicação aos caminhos legados de leitura.
4. Manter objetos aditivos dormentes antes de considerar remoção.
5. Nunca apagar leads reais para desfazer uma implantação.
6. Restaurar backup somente em corrupção, mudança destrutiva ou falha do rollback validado.

## Estado da homologação

- Contrato de eventos: definido na Fase 3.
- Plano de compatibilidade: concluído nesta fase.
- Bundle implementado: não.
- Banco alterado: não.
- Evento real enviado: não.
- Produção liberada: não.

## Próxima etapa — Fase 5/100

Especificar o bridge de compatibilidade e a matriz RLS/grants em artefatos pequenos e verificáveis, ainda sem aplicar migrations no banco ativo.
