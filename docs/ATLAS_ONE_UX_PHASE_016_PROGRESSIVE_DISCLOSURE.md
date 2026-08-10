# Atlas One — Fase 16: divulgação progressiva

Data: 04/08/2026

## Objetivo

Reduzir ruído textual sem apagar informação. A tela apresenta primeiro a decisão, o estado e a ação; explicações complementares e diagnósticos recuperáveis abrem somente quando solicitados.

## Alterações

- Cabeçalhos com orientação decisória mantêm essa orientação visível e movem a explicação complementar para “Entender esta visão”.
- Cabeçalhos sem orientação continuam exibindo sua descrição normalmente.
- Erros recuperáveis continuam mostrando título, proteção dos dados e botão de nova tentativa; o diagnóstico seguro fica em “Detalhes para recuperação”.
- O componente canônico de detalhes passou a declarar profundidade de análise e o contrato progressivo.
- Controles usam `details` e `summary` nativos, foco visível e sinais claros de abrir e fechar.

## Proteções

Nunca são recolhidos por padrão:

- decisão requerida;
- estado operacional;
- alerta crítico;
- ação principal;
- ação de recuperação.

## Impacto operacional

- Menos texto compete com filas, formulários e Kanban.
- A primeira leitura responde “o que fazer” antes de “como esta tela funciona”.
- Contexto e diagnóstico continuam disponíveis sem navegação adicional.
- Banco, APIs, autenticação, RLS, integrações e dados permanecem inalterados.

## Validação

```text
npm run ux:phase-016:check
npm test
npm run typecheck
npm run lint
```

## Próxima fase

Reorganizar métricas para mostrar no máximo cinco indicadores principais por visão e mover medidas secundárias para análise sob demanda.
