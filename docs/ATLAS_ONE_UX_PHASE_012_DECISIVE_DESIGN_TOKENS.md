# Atlas One — Fase 12: sistema visual decisivo

Data: 04/08/2026

## Objetivo

Eliminar a concorrência entre valores visuais legados e os tokens semânticos do Atlas One. A fase consolida tipografia, espaçamento, densidade, raios, sombras e movimento sem substituir componentes, rotas ou fluxos operacionais.

## Alterações

- `styles/atlas-tokens.css` passa a governar também escala tipográfica, alturas de linha, sombras de controle e card, raios ampliados e densidade de página, card, métrica e tabela.
- As variáveis antigas em `app/globals.css` permanecem compatíveis, mas agora são aliases da fonte semântica Atlas.
- Painéis, métricas, botões e cabeçalhos canônicos usam os tokens compartilhados.
- O modo compacto redefine apenas as variáveis de densidade. O modo confortável continua sendo o padrão, sem duplicar componentes.

## Impacto operacional

- Menos variação acidental entre páginas.
- Alterações futuras de densidade e legibilidade deixam de exigir correções espalhadas.
- A interface fica mais compacta no desktop sem prejudicar os alvos de toque ou o comportamento responsivo.
- Nenhum dado, permissão, API, autenticação ou integração foi alterado.

## Validação

```bash
npm run ux:phase-012:check
npm test
npm run typecheck
npm run lint
```

## Próxima fase

Reduzir o uso decorativo de cor e reservar azul para ação, mantendo verde, amarelo e vermelho exclusivamente para estados operacionais.
