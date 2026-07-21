# Atlas Meta Signal Intelligence — Fase 3/100

## Objetivo

Definir um **evento canônico** para cada fato comercial que o CRM poderá compartilhar com a Meta. A regra central é simples: o Atlas envia **um sinal por lead e marco comercial**, mantém o mesmo `event_id` nos reenvios e nunca transforma sugestão da IA, score ou simples tarefa em conversão.

Esta fase é de contrato e auditoria. Nenhum evento real foi enviado, nenhuma campanha foi alterada e nenhuma migration foi aplicada.

## Contrato canônico

| Evento | Fato comercial | Fonte da verdade | Deduplicação |
|---|---|---|---|
| `Lead` | lead recebido e importado | evento assinado de Lead Ads | lead externo, uma vez |
| `Contact` | primeiro contato comercial reconhecido | histórico do pipeline | lead + etapa contato |
| `QualifiedLead` | qualificação confirmada | histórico do pipeline | lead + etapa qualificação |
| `Schedule` | visita agendada/confirmada | histórico do pipeline | lead + etapa visita |
| `SubmitApplication` | proposta submetida | histórico ou simulação aprovada | lead + etapa proposta |
| `ConvertedLead` | venda ganha confirmada | resultado comercial registrado | lead + etapa ganho |
| `BuyerProfile` | compra realizada fora da plataforma | registro de comprador externo | lead, sem contar venda Atlas |

`BuyerProfile` é um sinal de aprendizado separado. Ele não soma receita, comissão ou conversão própria e não pode virar `ConvertedLead`.

## Deduplicação

O repositório já possui quatro proteções coerentes:

1. `event_id` determinístico por lead e marco;
2. restrição única `(organization_id, event_id)`;
3. `upsert` com o mesmo conflito, ignorando duplicatas;
4. reenvio pela fila preservando exatamente o mesmo `event_id`.

Isso evita que recarregamento da tela, retry do worker ou salvamento repetido de uma etapa infle os sinais. Se a Meta receber o mesmo fato novamente, a identidade do evento permanece estável.

## Gate de elegibilidade

Um evento só é elegível quando todas as condições aplicáveis forem verdadeiras:

- integração habilitada em modo de teste;
- código de evento de teste presente no momento da entrega;
- organização e lead correspondentes;
- consentimento explícito, quando exigido;
- telefone ou e-mail disponível para correspondência;
- identificadores normalizados e resumidos com SHA-256 no servidor;
- avanço real do funil, nunca regressão ou salvamento da mesma etapa;
- fato humano ou governado registrado no CRM;
- `event_id` estável em todos os retries.

São proibidos: sugestão isolada da IA, mudança apenas de score, tarefa sem ação do cliente, lead perdido como conversão positiva, base fria sem consentimento e compra externa contabilizada como venda própria.

## O que a auditoria encontrou

### Pronto no código

- mapeamento dos sete eventos do contrato;
- progressão somente para frente;
- perdas e regressões mantidas apenas na memória interna;
- consentimento verificado antes de enfileirar e antes de entregar;
- e-mail e telefone transformados no servidor;
- fila com retry e dead letter;
- produção bloqueada por constraint e por código;
- deduplicação no banco e no payload enviado.

### Lacunas que permanecem bloqueadas

O histórico do pipeline é criado antes do aprendizado, mas o evento de conversão ainda não persiste um `source_event_id` imutável. Também não há coluna dedicada para o snapshot de consentimento e a etapa `ganho` ainda precisa de uma prova explícita de resultado comercial confirmado.

Essas lacunas não autorizam atalhos. O contrato fica aprovado, mas `safeForSingleTestEvent` permanece falso até que a evidência seja vinculada e o runtime esteja pronto.

## Situação do runtime

Na auditoria anterior, o Data API respondeu `PGRST205` para as tabelas Meta e para a fila que ainda não existem no banco conectado. O repositório local contém a implementação, mas o Supabase remoto está muito atrás no histórico de migrations. Portanto:

- contrato estático: definido e auditado;
- origem de evidência persistida: pendente;
- schema Meta no runtime: pendente;
- evento único de teste: bloqueado;
- produção: bloqueada.

As tabelas futuras devem manter grants mínimos explícitos e RLS por organização. A chave `service_role` continua exclusiva do servidor e nunca pode chegar ao cliente.

## Alinhamento atual

A Meta descreve a Conversions API como conexão direta entre dados do servidor/CRM e os sistemas de otimização e medição, inclusive para ações posteriores da jornada. Isso reforça a estratégia do Atlas: poucos sinais, profundos, consentidos e verificáveis, em vez de grande volume sem qualidade.

O changelog atual do Supabase também alerta que novas tabelas no schema público podem não ser expostas automaticamente ao Data API. A futura sincronização precisará tratar `GRANT` e RLS como controles distintos.

Referências:

- [Meta — About Conversions API](https://www.facebook.com/business/help/AboutConversionsAPI)
- [Meta — Marketing API oficial no Postman](https://www.postman.com/meta/facebook-marketing-api/overview)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Exposição de tabelas ao Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

## Resultado da fase

- catálogo de eventos: fechado;
- fonte da verdade: definida;
- regra de deduplicação: fechada;
- gate de consentimento: validado no código;
- auditor estático e de runtime: implementado;
- evento real enviado: zero;
- alteração de mídia: zero;
- alteração de banco: zero.

## Próxima etapa

**Fase 4/100 — Plano seguro de compatibilidade do schema Meta.**

O próximo passo é separar, ordenar e ensaiar somente as migrations necessárias para ingestão, conversão e fila, preservando dados, com backup, RLS, grants explícitos e rollback. Nada será aplicado diretamente ao banco real.
