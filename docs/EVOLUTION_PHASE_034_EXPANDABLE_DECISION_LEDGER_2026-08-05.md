# Fase 34 — Histórico expansível de decisões

## Objetivo

Manter a leitura executiva compacta sem esconder decisões que pertencem ao mesmo recorte.

## Entrega

- O Livro Executivo continua abrindo com as 12 decisões prioritárias.
- Quando existirem mais registros, o usuário pode exibir todas as decisões daquele recorte.
- A opção “Mostrar leitura rápida” restaura a visão compacta.
- A expansão é local à interface: não altera dados, regras, responsáveis ou prazos.

## Validação

- `npm run typecheck` aprovado.
- `npm run lint` aprovado sem avisos.
- `node --test tests/contracts/assisted-interaction-governance.test.mjs` aprovado: 12 de 12.

## Impacto operacional

O diretor preserva foco no que é prioritário, mas ganha acesso imediato ao histórico completo sem mudar de módulo nem perder o filtro aplicado.
