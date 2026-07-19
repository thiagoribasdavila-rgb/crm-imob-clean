# ATLAS AI OS — Fase 84/3000

## Objetivo

Medir quanto da memória comercial observada possui projeto e origem legíveis e, separadamente, quanto desse contexto foi realmente preservado no momento da confirmação humana.

## Problema resolvido

Uma contagem contextual podia estar disponível por duas bases diferentes: snapshot histórico gravado no resultado ou cadastro atual da lead usado por compatibilidade legada. Somar as duas sem distinção faria a operação interpretar disponibilidade atual como memória histórica comprovada.

## Alterações realizadas

- Criado contrato tipado de cobertura contextual para projeto e origem.
- O denominador é sempre o total de resultados humanos confirmados e únicos por tarefa em cada janela.
- Exibidos percentuais distintos para contexto disponível e contexto preservado no fato.
- Comparadas janelas atuais e anteriores de igual duração: 7, 30 ou 90 dias.
- Snapshot histórico com projeto ou origem nulos permanece sem classificação.
- Fallback de registros antigos continua explícito e não é convertido em backfill.
- A API autenticada entrega a leitura no mesmo escopo de organização e RLS da fila diária.
- O Copilot apresenta uma visão compacta, progressiva e sem expor dados pessoais.

## Impacto operacional

Diretores e gestores conseguem distinguir três situações: memória contextual realmente preservada, contexto apenas disponível pelo cadastro atual e resultado ainda sem projeto ou origem. Isso indica onde a base precisa melhorar antes de usar segmentações históricas na tomada de decisão.

## Segurança e governança

- Nenhuma chave ou contato pessoal é retornado no painel de cobertura.
- Nenhuma chamada de modelo generativo é feita.
- Nenhuma escrita, correção automática, distribuição ou automação é disparada.
- A rota exige sessão válida, resolve a organização, usa o cliente RLS do usuário e responde com `no-store`.
- A política proíbe inferir associação histórica ausente.

## Compatibilidade

- Resultados novos usam o snapshot histórico versionado da Fase 82.
- Resultados antigos permanecem legíveis pelo fallback do cadastro atual, identificado como legado.
- Nenhuma migration, alteração de schema ou alteração de dados reais foi necessária.
- As versões atuais do projeto continuam compatíveis com o requisito futuro de TypeScript 5 anunciado no changelog do Supabase.

## Risco identificado

O fallback legado pode mostrar um projeto ou origem atual que não corresponda ao contexto no momento do resultado. Por isso ele aumenta apenas a cobertura disponível, nunca a cobertura histórica preservada.

## Checklist de validação

- [x] Projeto e origem medidos separadamente.
- [x] Disponibilidade e preservação histórica não são confundidas.
- [x] Janelas atual e anterior têm a mesma duração.
- [x] Percentuais usam resultados observados como denominador explícito.
- [x] Valor histórico nulo permanece sem contexto.
- [x] Filtro supervisionado alcança a nova leitura.
- [x] Autenticação, tenant, RLS e `no-store` preservados.
- [x] Nenhuma escrita downstream ou chamada de IA adicionada.
- [x] Build e ZIP continuam reservados ao gate de release.

## Próxima etapa recomendada

Fase 85 — criar uma fila curta e auditável de lacunas contextuais, ordenada por idade factual e impacto observável, sempre com correção humana e sem preenchimento automático.
