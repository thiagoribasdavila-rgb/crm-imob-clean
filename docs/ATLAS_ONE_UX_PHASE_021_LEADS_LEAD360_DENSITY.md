# Atlas One — Fase 21: Leads e Lead 360 orientados à ação

Data: 04/08/2026

## Objetivo

Reduzir o ruído inicial da carteira e do perfil 360 sem remover capacidades existentes. A primeira leitura passa a privilegiar identificação, contato, prioridade e próxima ação.

## Alterações

- O diagnóstico V30 da carteira permanece disponível em “Ver diagnóstico da carteira”.
- Contexto consolidado, qualidade da memória, explicação do score, timeline completa e matching continuam no Lead 360 sob demanda.
- Busca, filtros, tabela, transferência, contato, edição, acompanhamento e próxima ação continuam visíveis e funcionais.
- A solução reutiliza `AtlasDetailDisclosure`, com semântica nativa de `details/summary` e navegação por teclado.

## Impacto operacional

- Menos competição visual antes do primeiro contato.
- Ações de venda aparecem antes das análises explicativas.
- A profundidade de dados continua disponível sem duplicar páginas nem remover informação.

## Limites da fase

Não houve alteração em API, Supabase, schema, RLS, autenticação, hierarquia, dados reais, integrações, regras comerciais ou pacote de release.

## Validação

```bash
npm run ux:phase-021:check
node --test tests/contracts/leads-lead360-density.test.mjs
npm test
npm run typecheck
npm run lint
```
