# ATLAS ONE — Fase 38: colunas vazias adaptativas

## Objetivo

Reduzir o espaço ocupado por etapas vazias sem esconder a estrutura do funil nem prejudicar a movimentação de oportunidades.

## Entrega

- colunas com oportunidades mantêm a largura operacional completa;
- colunas realmente vazias viram marcadores compactos de 148 px;
- a etapa continua mostrando nome, quantidade e estado vazio útil;
- foco por teclado ou ação dentro da etapa restaura a largura completa;
- etapas anterior e seguinte se expandem quando um card recebe intenção de movimento;
- ao iniciar um arraste, todas as etapas vazias voltam a ser destinos amplos e seguros;
- o destino ativo preserva destaque, histórico e possibilidade de desfazer;
- navegação móvel continua exibindo todas as etapas do recorte atual.

## Segurança preservada

Nenhuma tabela, migration, API, RLS, permissão, histórico ou regra de movimentação foi alterada.

## Validação

Executar `npm run ux:phase-038:check`, seguido de typecheck, lint e testes completos.

## Próxima fase

Aplicar densidade progressiva ao conteúdo das colunas, mantendo a primeira decisão visível e carregando detalhes conforme a interação.
