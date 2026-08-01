# ATLAS AI OS — FASE 50/∞

## Objetivo da fase

Interromper os erros de leitura de leads e fazer o pipeline entender o banco que realmente está ativo, sem alterar dados, aplicar migrations em massa ou mascarar falhas com uma carga integral em memória.

## Problema resolvido

A listagem solicitava campos inexistentes (`assigned_to`, `development_id`, `score`, `preferred_regions`, `bedrooms`, `metadata`, `last_interaction_at`, `next_action_at` e `updated_at`). A resposta 400 era seguida por uma busca de até 5.000 linhas, criando latência e paginação incorreta. O Kanban também recebia etapas antigas em maiúsculas e não conseguia encaixar todos os cards nas colunas canônicas.

## Alterações realizadas

- inventário do schema real e das funções disponíveis no Supabase;
- contrato explícito dos campos existentes em `leads` e `profiles`;
- consulta única usando apenas colunas reais;
- filtros, ordenação, contagem e paginação executados no banco;
- remoção do fallback de 5.000 registros em memória;
- tradução de `score_ia`, `assigned_user_id`, `project_id`, `next_contact`, `preferred_bedrooms` e `preferred_neighborhoods` para o contrato canônico do V3;
- normalização das etapas antigas para `novo`, `contato`, `qualificacao`, `visita`, `proposta`, `contrato`, `ganho` e `perdido`;
- bloqueio, por padrão, da consulta a `pipeline_stage_settings` enquanto a relação não existir;
- sprint corretivo de dez fases formalizado.

## Impacto operacional

A listagem deixa de gerar uma falha conhecida antes de responder. Os 418 registros operacionais podem ser paginados corretamente e o pipeline passa a receber as etapas em um único idioma operacional. A base histórica de 16.733 contatos permanece isolada e não polui o Kanban.

## Riscos identificados

- criação e edição ainda dependem de funções e campos que serão tratados na Fase 51;
- hierarquia do banco atual usa `team`, sem `reports_to`; a correção definitiva pertence à Fase 52;
- movimentação atômica ainda não existe no banco ativo e será concluída na Fase 55;
- o Kanban ainda precisa de redesenho e otimização nas Fases 56–58.

## Checklist de validação

- [x] schema real inventariado;
- [x] nenhum dado alterado;
- [x] nenhuma migration executada;
- [x] nenhuma consulta inicial a colunas ausentes;
- [x] paginação realizada pelo banco;
- [x] etapas legadas normalizadas;
- [x] base arquivada excluída do fluxo ativo;
- [x] fallback de 5.000 linhas removido;
- [x] consulta opcional a configuração de etapas protegida;
- [x] build e ZIP não executados.

## Próxima etapa recomendada

**Fase 51/∞ — escrita segura de leads e histórico:** compatibilizar criação, edição, atividade e eventos com as estruturas atuais, removendo os 404 de RPC e de `atlas_events` sem perder auditoria.
