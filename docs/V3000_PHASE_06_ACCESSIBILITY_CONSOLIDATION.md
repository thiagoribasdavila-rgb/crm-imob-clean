# Atlas One V3000 — Fase 6: responsividade e acesso por teclado

## Resultado

O template canônico V3000 agora possui um contrato único de responsividade,
teclado, foco visível, movimento reduzido e alto contraste. A melhoria é
herdada pelo piloto de Notificações e pelas próximas páginas migradas, sem
alterar API, autenticação, Supabase ou regras comerciais.

## Alterações aplicadas

- atalho de teclado que leva diretamente à área operacional;
- alvo de foco programático identificado e nomeado pelo título do workspace;
- anúncio educado dos estados recuperáveis da página;
- contenção de largura para impedir estouro de cards e textos;
- coluna de contexto fluida, empilhada naturalmente em telas menores;
- alvo de toque mínimo de 44 px no atalho;
- foco visível com os tokens semânticos do Atlas One;
- suporte a `prefers-reduced-motion` e `forced-colors`;
- ações e cabeçalhos adaptáveis em viewport estreita.

## Contrato preservado

| Área | Evidência |
| --- | --- |
| Server Component | Template continua sem `use client`, hooks ou `fetch` |
| Shell | Nenhum segundo elemento `main` foi criado |
| Operação | Slots, APIs, sessão e Realtime não foram alterados |
| Banco | Nenhuma migration, tabela, policy ou RLS foi modificada |
| Navegação | Rota e menu do piloto permanecem iguais |
| Acessibilidade | Skip link e alvo possuem referência e nome compatíveis |
| Responsividade | Conteúdo aceita largura mínima zero e contexto fluido |

## Validação da fase

O contrato automatizado verifica:

1. referência entre skip link e alvo focável;
2. preservação do Server Component e do shell;
3. região de feedback com `aria-live="polite"`;
4. alvo de toque, foco visível e largura fluida;
5. movimento reduzido e modo de alto contraste.

## Escopo intocado

- dados e CRM em produção;
- Supabase, migrations e RLS;
- autenticação e perfis;
- API e Realtime de Notificações;
- Command Center, Leads e Pipeline;
- deploy e pacote Hostinger.

## Próxima fase recomendada

Executar a prova visual do piloto em mobile e desktop com sessão autenticada.
Somente após essa evidência, escolher uma segunda página operacional de baixo
risco para adoção do template V3000.
