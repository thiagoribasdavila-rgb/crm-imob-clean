# ATLAS AI OS — Fase 18/100

## Payload Meta em modo de validação, sem entrega

### Resultado

O Atlas agora possui um contrato local e determinístico para montar, em memória, a estrutura de um evento Meta sem enviá-lo. O gate permanece fechado porque a Fase 17 ainda não recebeu evidência do branch Supabase isolado.

Esta fase não acessou produção, não alterou o banco, não chamou a Graph API, não enviou evento de teste, não mudou campanha, orçamento ou público e não executou build.

## Por que esta fase existe

A Conversions API permite conectar dados do CRM e eventos de etapas posteriores do funil à Meta para medição e otimização. Isso só é útil quando o sinal representa um resultado comercial verdadeiro. Atividade operacional não pode ser apresentada como conversão.

O Atlas passa a separar explicitamente:

| Fato observado | Evento elegível | Regra |
|---|---|---|
| Lead recebido por origem governada | `Lead` | consentimento aplicável e origem comprovada |
| Contato efetivo | `Contact` | tentativa sem resposta não conta |
| Qualificação estruturada | `QualifiedLead` | score sozinho não conta; confirmação humana obrigatória |
| Visita confirmada | `Schedule` | compromisso confirmado, não apenas tarefa criada |
| Proposta formal submetida | `SubmitApplication` | proposta ou simulação governada |
| Venda própria confirmada | `ConvertedLead` | resultado comercial confirmado e revisão humana |
| Compra realizada fora do Atlas | nenhum evento Meta nesta fase | memória interna `BuyerProfile`, nunca venda própria |

## Privacidade por construção

- E-mail e telefone existem apenas na entrada sintética e em memória.
- A normalização e o SHA-256 são realizados localmente antes da construção do `user_data`.
- A evidência gravável registra apenas as chaves presentes, nunca os valores brutos ou hashes.
- CPF, documentos, endereço, renda, mensagens, notas livres e atributos sensíveis são proibidos.
- `event_id` é estável para deduplicação, mas não pode conter telefone, e-mail ou outro dado pessoal.
- `custom_data` aceita somente uma lista pequena de campos comerciais governados.

## Gate fail-closed

O runner exige três arquivos JSON dentro do workspace:

- `ATLAS_PHASE17_DATA_API_EVIDENCE_FILE`: prova aprovada da Fase 17;
- `ATLAS_PHASE18_EVENT_INPUT_FILE`: entrada sintética do evento;
- `ATLAS_PHASE18_VALIDATION_EVIDENCE_FILE`: destino da prova sanitizada.

Sem evidência real do branch isolado, o processo encerra antes de construir o payload. Mesmo com a evidência aprovada, ele somente monta o payload em memória e grava um resumo sanitizado. O código não possui transporte HTTP nem lê `.env.local`.

## Estados desta fase

- contrato de sinais comerciais: **aprovado localmente**;
- privacidade e deduplicação: **aprovadas localmente**;
- autoteste com fixture sintética: **aprovado localmente**;
- evidência do branch isolado da Fase 17: **pendente**;
- chamada de rede Meta: **bloqueada**;
- evento de teste Meta: **bloqueado**;
- produção: **bloqueada**;
- build: **não executado**.

## Referências atuais

- Meta, [About Conversions API](https://www.facebook.com/business/help/AboutConversionsAPI).
- Meta, [Advantage+ leads campaigns](https://www.facebook.com/business/ads/meta-advantage-plus/leads).
- Supabase, [Securing your data](https://supabase.com/docs/guides/database/secure-data).

## Próxima fase

Depois da evidência aprovada da Fase 17, a Fase 19 poderá gerar a primeira prova `validation-only` com um evento totalmente sintético. Ela continuará sem transmitir o evento à Meta; a entrega de teste só poderá ser considerada em um gate posterior, com aprovação explícita e ambiente isolado.
