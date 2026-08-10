# Fase 23 — linha do tempo legível das decisões

## Objetivo

Dar contexto temporal à liderança sem ampliar o ruído do Livro Executivo.

## Entrega

- Cada decisão exibe quando foi registrada.
- Resultados encerrados passam a indicar também quando foram confirmados.
- Datas nulas ou legadas inválidas recebem texto seguro, sem expor valor técnico
  ou quebrar a tela.

## Limites preservados

- A leitura é derivada exclusivamente dos campos já existentes no livro.
- Não houve alteração de banco, API, permissões, automações ou decisões.

## Validação

- `npm run typecheck`
- `npm run lint`
- `node --test tests/contracts/assisted-interaction-governance.test.mjs`
