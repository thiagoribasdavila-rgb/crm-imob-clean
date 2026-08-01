# AUDITORIA DE CONSISTÊNCIA FINAL

**2026-07-31.** Tudo abaixo foi contado por comando, sobre arquivos **rastreados
pelo git** — não sobre o disco. Onde não foi possível medir, está escrito
**não medido**, que é diferente de zero.

## SUPERFÍCIE

| o quê | número |
|---|---:|
| arquivos `.tsx` | 289 |
| componentes em `components/` | 68 |
| páginas em `app/` | 198 |
| rotas de API | 204 |

## O ACHADO PRINCIPAL: A COR AINDA É CRAVADA

| medida | número |
|---|---:|
| ocorrências de hex (`#rrggbb`) em `.tsx` | **1.359** |
| arquivos com hex cravado | **80 de 289** (28%) |
| usos de `var(--atlas-*)` | 271 |
| `style={{ … }}` inline | 304 |

**A proporção é 5 para 1 contra o token.** Esta base já pagou uma correção por
isso: superfícies com `bg-white/[.03]` sumiam no tema claro, porque o tema claro
sobrescreve *texto* e não *superfície*. O defeito não foi eliminado — foi
corrigido onde doeu.

**Não corrigido nesta rodada, e o motivo:** trocar 1.359 ocorrências sem prova
visual por tela é a receita para quebrar 80 arquivos de uma vez. Isso é trabalho
de várias entregas com verificação em tela a cada lote, não de um `sed`.

## O QUE **NÃO** ESTÁ DUPLICADO — e isso é bom

| componente | definições encontradas |
|---|---:|
| `Modal` | 0 (não há componente próprio — os diálogos são compostos in loco) |
| `Drawer` · `Spinner` · `Skeleton` · `Toast` | 0 |
| `Tooltip` | **1** |

Não há três modais concorrentes nem quatro loaders — o risco clássico de
inconsistência **não** se materializou aqui. O que existe é o oposto: primitivas
que nunca foram extraídas.

## ÍCONES

`lucide-react` em apenas **4 arquivos**; **23** `<svg>` inline. Não há duas
bibliotecas de ícones competindo — há pouca padronização de origem.

## O QUE JÁ ESTÁ CERTO, MEDIDO

| guarda | resultado |
|---|---|
| `catch {}` silencioso | **0** |
| `.stack` exposto em `.tsx` | **0** |
| `<img>` sem `alt` | **0** |
| atributos `aria-*` | **786** |
| `focus-visible` | **96** |
| `prefers-reduced-motion` | 5 arquivos |
| textos vagos em botão (`>Confirmar<`…) | **1** |
| `confirm()` nativo | **3** |

## PENDÊNCIAS NOMEADAS

| # | achado | evidência |
|---|---|---|
| C-01 | 1.359 cores cravadas em 80 arquivos | `grep -ho '#[0-9a-fA-F]\{3,8\}' ` |
| C-02 | `app/(crm)/properties/mtching/page.tsx` — **rota com erro de digitação no caminho** | `git ls-files \| grep mtching` |
| C-03 | 4 páginas acima de 1.900 linhas (4.043 · 2.577 · 2.294 · 1.936) | `wc -l` |
| C-04 | 3 usos de `confirm()` nativo em ações que merecem diálogo próprio | `grep confirm(` |
| C-05 | 1 botão com texto vago | `grep '>Confirmar<'` |
| C-06 | 5 arquivos honram `prefers-reduced-motion`; não há sistema de movimento único | `grep -l prefers-reduced-motion` |
| C-07 | 9 arquivos mencionam densidade/compacto — **não existe modo de densidade do produto** | `grep -li 'densidade\|compacto'` |

**Nenhuma destas foi corrigida nesta rodada.** Estão aqui nomeadas, com o comando
que as reproduz, para não virarem descoberta de auditoria.
