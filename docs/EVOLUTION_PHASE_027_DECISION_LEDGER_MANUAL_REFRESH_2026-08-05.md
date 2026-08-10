# Fase 27 — atualização manual do Livro Executivo

## Objetivo

Dar à liderança uma forma direta de confirmar a leitura mais recente sem
recorrer ao recarregamento completo da página.

## Entrega

- Adicionado o botão `Atualizar` no cabeçalho do Livro Executivo.
- Durante a solicitação, o botão evita múltiplos envios e informa o estado de
  atualização.
- Falhas continuam preservando os registros já carregados e usam o mesmo fluxo
  seguro de nova tentativa.

## Limites preservados

- A ação é somente de leitura: não cria, altera ou encerra decisões.
- Sem alteração em banco, API, permissões ou automações.

## Validação

- `npm run typecheck`
- `npm run lint`
- `node --test tests/contracts/assisted-interaction-governance.test.mjs`
