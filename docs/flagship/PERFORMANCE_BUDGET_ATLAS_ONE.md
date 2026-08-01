# ORÇAMENTO DE PERFORMANCE — ATLAS ONE

**2026-07-31.** Este documento tem duas partes, e a segunda é a que importa:
o que foi **medido** e o que **não foi**.

## O QUE FOI MEDIDO

| medida | valor | como |
|---|---:|---|
| build de produção | **exit 0** | `npm run build` |
| JS em `.next/static/chunks` (soma de TODOS os chunks) | **18.685 KB** | `find … \| stat` |
| maior chunk isolado | **762 KB** | idem |
| 5 maiores chunks somados | 3.092 KB | idem |
| páginas acima de 1.000 linhas de fonte | **8** | `wc -l` |
| maior página | `command-center` — **4.043 linhas** | idem |
| `<Suspense>` no produto | **10** | `grep -c` |
| arquivos com skeleton | **77 de 289** | `grep -li skeleton` |
| `loading.tsx` | **1** | `git ls-files` |
| `error.tsx` | **1** | `git ls-files` |
| `not-found.tsx` | **0** | `git ls-files` |
| `dynamic(() => import(…))` | **0** | `grep -c` |

> **18.685 KB não é o que o usuário baixa.** É a soma de todos os chunks do app
> inteiro, incluindo rotas que ele nunca abre. Publicar esse número como "peso da
> página" seria a mesma classe de erro que este projeto vem corrigindo o mês
> inteiro. O peso **por rota** está na seção seguinte, como **não medido**.

## O QUE NÃO FOI MEDIDO — e por quê

| meta | estado | causa |
|---|---|---|
| **LCP < 2,5 s** | **não medido** | exige navegador instrumentado contra build de produção servido; a sessão mediu o dev server, cujos tempos não representam produção |
| **INP < 200 ms** | **não medido** | idem |
| **CLS < 0,1** | **não medido** | idem |
| peso de First Load JS **por rota** | **não medido** | o build com Turbopack nesta configuração **não publica a coluna de tamanho** na tabela de rotas |
| tempo para abrir Leads / visão 360 / filtrar / mover no pipeline | **não medido** | mesma causa do LCP |
| número de requisições por página | **não medido** | — |

**Nenhum destes números é estimado aqui.** Um orçamento de performance com metas
inventadas é pior que nenhum: ele vira número de reunião que ninguém pode
contestar porque ninguém sabe de onde veio.

## O QUE OS NÚMEROS MEDIDOS JÁ PERMITEM CONCLUIR

1. **Não há divisão de código por rota.** `dynamic(() => import())` aparece
   **zero** vezes e `<Suspense>` só 10. Uma página de 4.043 linhas entra inteira
   no bundle da rota.
2. **O carregamento progressivo é parcial.** 77 arquivos têm skeleton — mas há
   **um** `loading.tsx` em 198 páginas. A maioria das rotas não tem fronteira de
   carregamento do App Router.
3. **Não há página de erro por rota.** Um `error.tsx` para 198 páginas: qualquer
   falha de renderização cai no limite global.
4. **Não existe `not-found.tsx`.** URL errada não tem tela própria.

## PLANO DE CORREÇÃO, EM ORDEM DE CUSTO-BENEFÍCIO

| # | ação | por quê |
|---|---|---|
| P-01 | instrumentar LCP/INP/CLS contra `npm start` em 5 rotas principais | sem isto, nenhuma meta deste documento pode ser fechada |
| P-02 | `dynamic()` nos 4 blocos mais pesados do `command-center` | maior página, e é a primeira que o diretor abre |
| P-03 | `loading.tsx` nas 5 rotas principais | hoje a rota inteira espera a consulta mais lenta |
| P-04 | `not-found.tsx` e `error.tsx` por grupo de rota | erro sem tela própria vira tela branca |

**Nenhuma foi executada nesta rodada.**
