# Atlas One — Fase 13: disciplina semântica de cor

Data: 04/08/2026

## Objetivo

Diminuir ruído cromático nas superfícies canônicas. Azul passa a indicar ação, foco ou navegação ativa; verde comunica sucesso, amarelo comunica atenção e vermelho comunica bloqueio. Estrutura e conteúdo secundário permanecem neutros.

## Alterações

- Removido o segundo brilho violeta do fundo global.
- Progresso de navegação, ação primária e barras de progresso usam uma única família azul.
- Cabeçalhos, divisores, empty states, cards e marca do shell deixam de usar gradientes multicoloridos como decoração.
- Métricas preservam verde, amarelo e vermelho quando existe significado operacional.
- A classe violeta legada continua compatível, mas herda a cor de ação e não cria uma quinta semântica.

## Impacto operacional

- A ação principal é reconhecida mais rapidamente.
- Alertas e estados deixam de competir com decoração.
- A leitura fica mais sóbria e consistente sem perder feedback, foco ou acessibilidade.
- Nenhum fluxo, dado, papel, API ou integração foi modificado.

## Validação

```bash
npm run ux:phase-013:check
npm test
npm run typecheck
npm run lint
```

## Próxima fase

Padronizar cards por função — métrica, trabalho, decisão e análise — reduzindo variações estruturais sem remover conteúdo.
