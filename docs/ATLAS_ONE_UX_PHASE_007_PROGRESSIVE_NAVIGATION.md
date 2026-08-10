# Atlas One — Fase 7: navegação progressiva

## Resultado

A barra lateral agora mantém aberta apenas a rotina do papel e os favoritos. Os demais destinos permitidos ficam em **Mais**, reduzindo a extensão inicial do menu sem remover nenhuma capacidade.

## Recuperação de acesso

- a busca consulta todas as rotas permitidas e apresenta resultados diretamente;
- “Mais” abre automaticamente quando a rota atual está dentro dele;
- mesmo recolhido, “Mais” informa qual tela secundária está aberta;
- links profundos continuam válidos;
- favoritos retiram um destino de “Mais” e o mantêm visível;
- a partição usa o mesmo RBAC da navegação canônica.

## Segurança da mudança

Não houve alteração de rota, API, schema, dados, autenticação, RLS ou integração. A mudança é somente de organização visual e usa os destinos já existentes.

```bash
npm run ux:phase-007:check
node --experimental-strip-types --test tests/contracts/navigation-progressive-disclosure.test.mjs
```
