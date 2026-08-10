# Fase 139 — Kanban V30 Progressive Column Rendering

## Objetivo

Melhorar a fluidez do Kanban quando uma etapa possui muitos leads. A tela agora mostra primeiro os cards mais importantes e permite abrir o restante apenas quando o usuário quiser aprofundar.

## O que foi implementado

- Renderização progressiva por coluna.
- Limite inicial de oportunidades visíveis.
- Botão `Mostrar restantes` para expandir a etapa.
- Botão `Compactar etapa` para voltar à leitura enxuta.
- CSS premium com baixa interferência visual.

## Impacto operacional

O corretor não precisa disputar atenção com dezenas de cards ao mesmo tempo. O gerente enxerga prioridades e gargalos com mais clareza, mantendo a possibilidade de consultar todos os dados quando necessário.

## Segurança

- Não altera banco.
- Não apaga leads.
- Não movimenta oportunidades.
- Não muda regras de permissão.
- A mudança é somente de visualização e performance percebida.

## Validação

- `npm run evolution:phase-139:check`
- `npm run typecheck`
- `npm run lint`
