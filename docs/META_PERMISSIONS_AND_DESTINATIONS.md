# Atlas Meta Signal Intelligence — Fase 2/100

## Objetivo

Separar cinco estados que não podem mais ser confundidos no Atlas:

1. credencial configurada;
2. permissão concedida;
3. ativo acessível;
4. destino de dados pronto;
5. operação comprovada por um evento real.

Esta fase implementa uma auditoria somente leitura. Ela não altera campanha, orçamento, público, assinatura de webhook, banco ou migration.

## O que foi implementado

- contrato mínimo de permissões por finalidade;
- validação de `ads_read` para leitura publicitária;
- validação de `leads_retrieval`, `pages_show_list` e `pages_read_engagement` para operação de Lead Ads;
- validação separada de `pages_manage_metadata`, necessária para a configuração da assinatura de webhook;
- classificação de `ads_management` e `business_management` como condicionais, sem solicitá-las automaticamente;
- prova agregada de acesso à conta, Páginas, formulários e dataset, sem exibir IDs;
- auditoria dos destinos de ingestão, atribuição, conversão, fila e aprendizado;
- bloqueio explícito quando o código existe, mas o runtime ainda não suporta a operação.

## Diagnóstico real do ambiente

O projeto Supabase está saudável e usa PostgreSQL 17.6. Porém, o histórico remoto possui apenas **33 de 123** migrations locais. Cerca de 90 migrations ainda precisam ser avaliadas antes de qualquer sincronização.

Isso explica os principais bloqueios atuais:

- `meta_lead_sources`: ausente no runtime;
- `meta_lead_events`: ausente no runtime;
- `meta_conversion_configs`: ausente no runtime;
- `meta_conversion_events`: ausente no runtime;
- `lead_attribution_touches`: ausente no runtime;
- `integration_outbox`: ausente no runtime;
- `meta_andromeda_learning_cycles`: ausente no runtime;
- contrato novo de atribuição em `leads`: ainda indisponível.

O Data API responde com `PGRST205` para as tabelas ausentes e com `42703` para colunas ainda não aplicadas. Logo, o pipeline Meta está implementado no repositório, mas não está operacional no banco conectado.

O token Graph local também não passou na prova de leitura e retornou erro 190, compatível com token expirado ou inválido. `META_CONVERSIONS_ACCESS_TOKEN` ainda não está disponível no ambiente local auditado.

## Segurança do Data API

Projetos Supabase atuais não devem depender de exposição automática de novas tabelas. Cada superfície usada pelo Data API precisa de:

- grants explícitos mínimos;
- RLS ativada;
- policies coerentes com organização e hierarquia;
- escrita de integração restrita ao servidor/service role;
- ausência de acesso anônimo aos dados comerciais.

As migrations Meta locais já seguem parte desse padrão. Mesmo assim, elas não serão aplicadas em lote sem backup, conferência de dependências e ensaio controlado.

## Contrato mínimo da Meta

| Capacidade | Requisito mínimo | Evidência de aprovação |
|---|---|---|
| Leitura de anúncios | `ads_read` | conta acessível e leitura de campanhas concluída |
| Receber leads | `leads_retrieval`, `pages_show_list`, `pages_read_engagement` | Página e formulário configurados visíveis ao token |
| Configurar webhook | `pages_manage_metadata` | assinatura verificada em etapa controlada |
| Descobrir ativos empresariais | `business_management` somente quando necessário | ativo pertencente ao Business correto |
| Operações que exijam gestão de anúncios | `ads_management` somente quando necessário | uso aprovado e justificado |
| Enviar conversões | token dedicado + dataset configurado | um evento de teste recebido e deduplicado |

O Atlas mantém privilégio mínimo: uma permissão condicional não vira obrigatória apenas para “facilitar” a integração.

## Andromeda e sinais do CRM

**Andromeda não é uma API** a ser conectada. O ganho vem da qualidade, consistência e velocidade dos sinais enviados pelo CRM à Meta: lead qualificado, contato, visita, proposta e venda, sempre com consentimento, atribuição, deduplicação e resultado confirmado.

O Atlas só poderá declarar aprendizado ativo depois de comprovar:

- lead real recebido e salvo;
- identidade elegível com consentimento;
- evento profundo associado ao mesmo lead;
- evento entregue ao dataset de teste;
- `event_id` deduplicado;
- decisão humana e resultado comercial preservados.

## Sequência segura para desbloquear

1. realizar backup do banco e validar restauração;
2. comparar o ledger remoto com as migrations locais;
3. agrupar migrations pendentes por dependência e risco;
4. ensaiar em ambiente separado, sem dados de produção;
5. aplicar grants mínimos, RLS e policies em cada nova superfície;
6. emitir tokens de longa duração/system user com o menor escopo possível;
7. cadastrar Página, formulário e dataset na organização correta;
8. executar um teste oficial de Lead Ads;
9. executar um único evento no dataset de teste da Conversions API;
10. confirmar recebimento, atribuição e deduplicação antes de ampliar volume.

Não é seguro aplicar cerca de 90 migrations pendentes de uma vez no ambiente real.

## Resultado da fase

- auditoria de permissão: implementada;
- auditoria de propriedade: implementada;
- auditoria de destinos: implementada;
- mutações na Meta: zero;
- mutações no banco: zero;
- operação Meta comprovada: ainda bloqueada por schema e credenciais;
- diagnóstico acionável: concluído.

## Próxima etapa

**Fase 3/100 — Contrato de eventos CRM e deduplicação.**

Antes de enviar sinais, o Atlas definirá o evento canônico, o identificador de deduplicação, a origem da verdade e os critérios que impedem conversões duplicadas ou sem consentimento.
