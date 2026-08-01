# ATLAS Meta Signal Intelligence — Fase 1/100

## Inventário real dos ativos Meta

**Objetivo:** separar o que está Implementado no ATLAS, o que está apenas Configurado e o que foi comprovado como Operacional. A presença de uma credencial nunca é tratada como prova de funcionamento.

**Modo desta fase:** somente leitura. Nenhuma campanha, público, orçamento, token, lead ou configuração de banco é alterada.

## Resultado executivo

O ATLAS já possui uma base técnica relevante para fechar o ciclo `Meta → lead → CRM → resultado → Meta`:

- webhook Lead Ads com verificação de assinatura, deduplicação, mapeamento por página/formulário e fila;
- importação do lead por worker, preservando campanha, conjunto, anúncio, página e formulário;
- atribuição de origem imutável e histórico por toque;
- fila de conversões com consentimento obrigatório, identificadores protegidos e repetição controlada;
- sinais de funil para contato, qualificação, visita, proposta e venda;
- leitura de insights de campanha em 1, 7 e 30 dias;
- ciclo de aprendizado agregado, auditável e sujeito à decisão do diretor.

Isso significa que o ATLAS não precisa de uma “API do Andromeda”. **Andromeda não é uma API direta para o CRM**. O valor do ATLAS está em enviar sinais de conversão corretos, profundos, recentes e atribuídos para a Meta aprender com compradores reais.

## Evidência real coletada em 19/07/2026

A auditoria somente leitura foi executada contra as credenciais e o Supabase configurados localmente. Nenhum nome, identificador, token ou dado pessoal foi exibido.

| Verificação | Evidência | Classificação |
|---|---|---|
| Meta Ads Graph API | HTTP `401`, código Meta `190` | token inválido/expirado neste ambiente; não operacional |
| Segredo e verificação do webhook | variáveis presentes | Configurado, mas sem prova de entrega real |
| Token de Conversions API | variável vazia | bloqueado |
| Tabelas `meta_lead_sources` e `meta_lead_events` | PostgREST `PGRST205` | migrations ausentes ou schema cache sem as tabelas |
| Tabelas `meta_conversion_configs` e `meta_conversion_events` | PostgREST `PGRST205` | migrations ausentes ou schema cache sem as tabelas |
| Contrato de atribuição em `leads` | PostgreSQL `42703` | colunas esperadas ainda ausentes no banco auditado |

Conclusão: o código está preparado, porém o ambiente auditado permanece **Configurado, não Operacional**. Um token atualizado na Hostinger pode ser diferente do arquivo local; isso precisa ser comprovado pelo mesmo teste no ambiente publicado antes de qualquer afirmação de ativação.

## Matriz de evidências

| Ativo | Implementado | Configurado no ambiente local | Prova Operacional exigida | Situação inicial |
|---|---:|---:|---|---|
| Conta de anúncios e Insights | Sim | Sim | leitura Graph API aprovada | falhou: Meta 190/401 |
| Campanhas | Sim, leitura agregada | Sim | campanhas acessíveis e estados retornados | não lidas por token inválido/expirado |
| Webhook Lead Ads | Sim | segredo e token presentes | webhook assinado + lead real importado | ainda não comprovado nesta fase |
| Página e formulário | Sim, cadastro multi-tenant | não são variáveis globais | fonte ativa no banco + formulário acessível | tabelas ausentes no banco auditado |
| Conversions API | Sim, somente modo de teste | token de conversões vazio na leitura local | `events_received = 1` no dataset de teste | bloqueada localmente |
| Dataset de conversão | Sim, por organização no banco | não fica no `.env` | configuração ativa + teste confirmado | tabela ausente no banco auditado |
| Atribuição | Sim | não depende de chave | primeiro toque e timeline registrados | contrato de banco ainda incompatível |
| Loop de aprendizado | Sim, governado | não depende de chave | entrega ≥95%, atribuição ≥80%, feedback ≥35% e sinal recente | ainda não pronto para escalar |

## Arquitetura encontrada

```text
Meta Lead Ads
  → webhook assinado
  → meta_lead_events
  → integration_outbox
  → worker busca o lead
  → leads + campaign_events + atribuição
  → avanço real no funil
  → meta_conversion_events
  → dataset Meta em modo de teste
  → confirmação events_received
  → ciclo de aprendizado agregado
  → recomendação para decisão do diretor
```

## Regras preservadas

- nenhuma alteração automática de público, campanha ou orçamento;
- nenhuma conversão sem consentimento registrado;
- telefone e e-mail são normalizados e protegidos antes do envio;
- sinais negativos permanecem internos;
- uma credencial presente significa apenas **Configurado**;
- somente uma resposta real e verificável promove o estado para **Operacional**;
- o modo atual de conversão continua restrito a teste.

## Lacunas prioritárias

1. Renovar o token de leitura Meta no ambiente correto e validar permissões/propriedade.
2. Aplicar, após backup e aprovação, as migrations Meta e de atribuição que já existem no repositório.
3. Recarregar o schema PostgREST e repetir a auditoria somente leitura.
4. Confirmar fonte de página/formulário e dataset em modo de teste.
5. Receber uma lead real de teste pelo webhook oficial.
6. Enviar um evento consentido ao dataset de teste e obter `events_received = 1`.
7. Medir atribuição, duplicidade, profundidade e frescor antes de qualquer escala.

## Como auditar sem expor dados

```bash
npm run meta:phase-001:check
npm run meta:phase-001:audit
```

O segundo comando consulta apenas estados e contagens. A saída omite nomes, IDs, tokens e dados pessoais.

## Critério de encerramento

A Fase 1 está concluída quando o inventário, o auditor seguro e o gate automático existem e passam. Ela não declara a integração completa como ativa; essa promoção depende das evidências reais das próximas fases.

## Próxima etapa — Fase 2/100

**Permissões, propriedade e destinos de dados:** validar acesso real à conta, páginas, formulários e dataset; mapear quem é proprietário de cada ativo; identificar permissões ausentes; manter toda a operação em modo somente leitura e teste.
