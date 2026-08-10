# Fase 6 — Encaminhamento de governança do aprendizado assistido

## Objetivo

Quando a leitura agregada da captura assistida indicar **revisão** ou **observação**, encaminhá-la ao Livro Executivo já existente, sem criar uma nova fila, tabela ou automação comercial.

## Alteração realizada

- `lib/ai/assisted-interaction-governance.ts` converte exclusivamente métricas agregadas em uma recomendação supervisionada.
- O Centro de Decisão recebe a recomendação de forma transitória e a apresenta junto das outras decisões priorizadas.
- A decisão somente se torna persistente após o gestor preencher a decisão humana, responsável, prazo e justificativa no Livro Executivo existente (`atlas_decisions`).
- O resultado continua dependente de registro humano posterior.

## Limites preservados

- Não lê nem apresenta conteúdo de conversas.
- Não altera lead, score, responsável, etapa, campanha ou tarefa.
- Não envia mensagens, nem executa ação externa.
- Não cria decisão quando a amostra é insuficiente ou a leitura está estável.

## Validação manual

1. Como gestor, abra `/decision-center`.
2. Quando a leitura indicar revisão ou observação, escolha **Registrar revisão no Livro Executivo**.
3. Defina decisão, responsável, prazo e justificativa.
4. Registre depois apenas o resultado realmente observado.
5. Confirme que nenhuma ação comercial foi executada automaticamente.
