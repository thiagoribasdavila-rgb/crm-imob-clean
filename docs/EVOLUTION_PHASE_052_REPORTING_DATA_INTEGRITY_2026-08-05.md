# Fase 52 — Integridade de dados nos relatórios

## Objetivo

Evitar que o painel executivo transforme ausência de integração de mídia em métricas financeiras iguais a zero.

## Alterações

- Os custos, receitas, leads e vendas de campanha agora permanecem como **não informados** enquanto a fonte de atribuição não os disponibiliza.
- ROI e CPL só são calculados quando todos os dados necessários existem.
- Se uma consulta falhar, os últimos dados válidos permanecem visíveis; a página não os substitui por uma coleção vazia.
- Foi incluído um botão de recuperação e proteção contra respostas antigas ou atualização de tela desmontada.

## Impacto operacional

Diretoria e incorporadoras não recebem uma leitura artificial de investimento, receita, ROI ou CPL. A ausência de dado aparece como ausência de dado, preservando a decisão humana.

## Validação

- Contrato automatizado para ausência de métricas financeiras.
- Contrato automatizado para preservação do último estado válido e recuperação.
- Typecheck e lint do projeto.

## Escopo preservado

Nenhuma tabela, migration, credencial, campanha, lead ou dado remoto foi alterado nesta fase.
