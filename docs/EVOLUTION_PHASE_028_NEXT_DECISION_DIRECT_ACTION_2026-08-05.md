# Fase 28 — ação direta na próxima decisão

## Objetivo

Reduzir passos entre a identificação de uma decisão prioritária e o registro
humano do resultado observado.

## Entrega

- O card `Próxima decisão` abre diretamente o formulário de resultado quando o
  ciclo ainda aguarda confirmação.
- A tela desloca o foco de forma suave para o formulário aberto.
- A seleção também reinicializa resultado, descrição e avaliação para impedir
  reaproveitamento acidental de uma decisão anterior.
- Casos sem resultado pendente preservam o atalho existente para visualizar o
  livro no filtro adequado.

## Limites preservados

- A ação continua exigindo registro manual e não executa nenhuma ação externa.
- Sem alteração de banco, API, permissões, automações ou critérios de decisão.

## Validação

- `npm run typecheck`
- `npm run lint`
- `node --test tests/contracts/assisted-interaction-governance.test.mjs`
