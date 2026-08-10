# ATLAS ONE — Fase 30: campanhas orientadas a resultado e decisão

## Objetivo

Colocar na primeira leitura o que muda a decisão do Diretor: vendas registradas, receita observada, investimento realmente conhecido e conversão observada.

## Nova hierarquia

1. Quatro indicadores comerciais verificáveis.
2. Uma decisão recomendada conforme a condição real da carteira.
3. Campanhas com a sequência campanha → leads → vendas.
4. Cadastro, briefing e criativos disponíveis sob demanda.

## Verdade dos números

- Custo ausente aparece como **“Não informado”**, nunca como investimento zero.
- Verba planejada permanece separada do gasto real.
- Receita registrada no CRM é chamada de observada; não é apresentada como ganho incremental comprovado.
- A página não inventa causalidade entre campanha e venda.

## Operação preservada

CRUD, alteração de status, arquivamento, upload privado, busca, vínculo com projeto e sinalização da Meta continuam disponíveis. Não houve migration, alteração de RLS, envio externo, build ou mudança em dados reais.

## Validação

```bash
npm run ux:phase-030:check
npm run typecheck
npm run lint
npm test
```
