# ATLAS ONE — Fase 362 · Decisão explicável da roleta

## Objetivo

Unir capacidade, peso, presença, ordem da roleta e prioridade comercial em uma leitura única para a diretoria, sem alterar a regra real de distribuição nem os dados da operação.

## Correção aplicada

- a prévia agora usa desempate determinístico por identificador depois de carga ponderada e última entrega;
- a diretoria vê quem receberia a próxima lead e o motivo objetivo da decisão;
- a capacidade restante no projeto e na carteira total aparece antes de salvar;
- alterações locais são identificadas como prévia não salva;
- prioridade da lead e seleção do corretor são explicadas como decisões distintas;
- a quantidade de regras de prioridade ativas no empreendimento é exibida sem expor dados pessoais;
- corretores bloqueados continuam fora da roleta com o motivo operacional preservado.

## Paridade com a operação

A implementação reaproveita a regra já persistida e auditada por
distribute_project_leads_v4 e lead_distribution_events. Nenhuma migration,
tabela, policy ou dado remoto foi alterado nesta fase.

## Evidência local

- contrato da roleta: 12/12 testes aprovados;
- desempate determinístico: aprovado;
- capacidade e motivo da decisão: aprovados;
- TypeScript: aprovado;
- ESLint: aprovado.

## Estado da fase

implemented_local / deployment_parity_pending

A fase ainda exige prova autenticada com dados reais antes de promoção. Nenhum
ZIP, build de release ou deploy foi gerado isoladamente.

## Rollback seguro

A mudança está limitada ao cálculo puro da prévia, ao componente da roleta e à
contagem de regras já retornadas pela API. O fluxo transacional de atribuição
permanece inalterado.
