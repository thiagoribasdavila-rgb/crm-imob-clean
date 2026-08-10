# Atlas One — Fase 15: cabeçalho compacto e decisivo

Data: 04/08/2026

## Objetivo

Recuperar espaço útil no início das telas e tornar a primeira leitura mais direta. O cabeçalho agora informa contexto, título, orientação curta e no máximo uma ação visível, sem se comportar como um segundo painel executivo.

## Alterações

- O cabeçalho canônico declara densidade compacta e quantidade de ações visíveis.
- A altura mínima caiu para 88 px no modo normal e 76 px no compacto.
- A descrição foi limitada a duas linhas para impedir introduções longas.
- A camada visual V30 deixou de transformar todo cabeçalho em um hero com gradientes e grande moldura.
- A ação contextual preserva área de toque e ocupa a largura disponível no celular.
- Título, orientação de decisão e ação continuam opcionais e compatíveis com as telas atuais.

## Impacto operacional

- O conteúdo de trabalho aparece mais cedo, com menos rolagem.
- O usuário identifica mais rapidamente onde está e qual ação pode executar.
- Cabeçalho e cards deixam de competir pela atenção.
- Nenhuma rota, API, banco, autenticação, RLS ou integração foi alterada.

## Validação

```text
npm run ux:phase-015:check
npm test
npm run typecheck
npm run lint
```

## Próxima fase

Aplicar divulgação progressiva aos textos explicativos e diagnósticos, deixando a decisão principal visível e os detalhes sob demanda.
