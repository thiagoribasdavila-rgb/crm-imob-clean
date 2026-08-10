# Fase 30 — Métricas que levam à ação

## Objetivo

Reduzir a distância entre o resumo executivo e a decisão que exige atenção, sem alterar registros, regras de negócio ou dados da operação.

## Entrega

- Os cartões de resultados pendentes, prazos vencidos, vencimento em 24 horas, decisões sem prazo e ciclos encerrados agora funcionam como atalhos seguros.
- Cada atalho aplica o filtro correspondente no Livro Executivo e leva a visualização até a lista de decisões.
- O cartão de decisões registradas permanece somente informativo, pois representa uma janela semanal e não um filtro equivalente.
- Os atalhos não criam, editam, encerram ou atribuem decisões; apenas reorganizam a leitura do histórico já existente.

## Validação

- `npm run typecheck` aprovado.
- `npm run lint` aprovado sem avisos.
- `node --test tests/contracts/assisted-interaction-governance.test.mjs` aprovado: 12 de 12.

## Impacto operacional

O diretor consegue ir de um número crítico para a lista certa em um clique, mantendo decisão humana, rastreabilidade e validação de resultado como etapas obrigatórias.
