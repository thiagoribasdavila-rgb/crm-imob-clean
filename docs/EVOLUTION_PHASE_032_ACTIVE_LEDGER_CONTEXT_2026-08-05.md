# Fase 32 — Contexto do recorte ativo

## Objetivo

Manter explícito qual grupo de decisões está em análise no Livro Executivo.

## Entrega

- O cabeçalho da lista agora apresenta o recorte ativo, como “Prazos vencidos” ou “Sem prazo”.
- A quantidade exibida continua vinculada ao recorte selecionado.
- A alteração usa atualização anunciável para tecnologias assistivas e não modifica registros do CRM.

## Validação

- `npm run typecheck` aprovado.
- `npm run lint` aprovado sem avisos.
- `node --test tests/contracts/assisted-interaction-governance.test.mjs` aprovado: 12 de 12.

## Impacto operacional

O diretor mantém contexto ao alternar prioridades, reduzindo interpretação manual e o risco de agir sobre uma lista diferente da métrica escolhida.
