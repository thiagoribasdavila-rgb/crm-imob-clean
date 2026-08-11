# V3000 — Fase 54: movimento, foco e acessibilidade

## Resultado

O Kanban passa a declarar um contrato único de acessibilidade para seus cards
críticos. Nome do lead, projeto, etapa e próxima ação formam a alternativa
textual; o card informa os destinos possíveis e os limites do funil sem exigir
o uso do mouse.

O alvo da implementação é WCAG 2.2 nível AA nos componentes críticos. A fase
estabelece contraste textual mínimo de 4,5:1, alvo interativo mínimo de 24px e
44px nas ações primárias. O foco permanece visível no card, nos controles e nas
divulgações progressivas, inclusive em modo de cores forçadas.

## Movimento com propósito

Movimento visual só pode comunicar mudança de estado, chegada de dado ou
expansão de contexto. Arrastar um card confirma a mudança sem esconder o
conteúdo. Em `prefers-reduced-motion: reduce`, transições, animações e rolagem
suave não essenciais são removidas dentro do board.

## Teclado e leitores de tela

- `Tab` posiciona o foco nos cards e controles;
- `Alt + ←` volta uma etapa quando houver destino;
- `Alt + →` avança uma etapa quando houver destino;
- a região `aria-live="polite"` anuncia salvamento, sucesso e erro;
- `aria-keyshortcuts` torna os comandos descobríveis;
- o card ocupado informa que o movimento está temporariamente indisponível.

Os atalhos continuam chamando o mesmo `moveByKeyboard` e, por consequência, o
mesmo fluxo governado de `moveLead`. Nenhuma regra comercial foi duplicada.

## Dados e segurança

A fase não cria migration, não altera banco, não amplia visibilidade e não chama
IA. Autenticação, organização, cargo, APIs, auditoria, desfazer e RLS do Supabase
continuam preservados.

## Aceite verificável

- alternativa textual contextual em todos os cards;
- foco visível e contraste reforçado nos componentes críticos;
- navegação e movimento completos por teclado;
- anúncio de estado atômico e não intrusivo;
- suporte a contraste elevado e cores forçadas;
- modo de movimento reduzido sem bloquear ação ou leitura;
- nenhuma alteração no fluxo de venda ou persistência.
