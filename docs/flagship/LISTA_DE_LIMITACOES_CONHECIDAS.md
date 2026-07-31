# LIMITAÇÕES CONHECIDAS

**2026-07-31.** Nada aqui é suposição: cada item tem o comando que o reproduz.
Uma limitação declarada é dívida; uma limitação escondida é armadilha.

## BLOQUEANTES PARA OPERAÇÃO COMERCIAL

| # | limitação | evidência |
|---|---|---|
| B-01 | **Nada desta sessão está em produção.** `/api/v1/ready` não declara `build` | `npm run commit-publicado:check` |
| B-02 | **Os 13 workers não rodam**: o crontab nunca foi instalado no servidor | `npm run cron:validar` recusa fora do servidor |
| B-03 | **O CRM lê a conta de anúncios errada**: R$ 3.612,01 em 7 campanhas, 0 leads; as 24 leads vêm de campanha de outra conta | `docs/auditoria/INDICADORES_OFICIAIS.md` |
| B-04 | **Página Meta `1115087091694606` não compartilhada** com o Business Manager | mapeamento da Meta, Fase 2B |

Os quatro dependem de acesso ou decisão que não são meus.

## NÃO BLOQUEANTES, MEDIDOS

| # | limitação | número |
|---|---|---:|
| N-01 | 9 contratos **pulados** — PostGIS, exigem banco com credencial | 9 |
| N-02 | 1.359 cores cravadas em 80 arquivos `.tsx` | 1.359 |
| N-03 | 4 páginas acima de 1.900 linhas | 4 |
| N-04 | `dynamic(() => import())` no produto | **0** |
| N-05 | `loading.tsx` para 198 páginas | **1** |
| N-06 | `not-found.tsx` | **0** |
| N-07 | rota com erro de digitação: `properties/mtching` | 1 |
| N-08 | 414 arquivos vazios rastreados | 414 |
| N-09 | 15 migrations existem só no banco, sem arquivo | 15 |
| N-10 | módulo de IA ainda órfão: `grafo-de-receita` | 1 |
| N-11 | LCP / INP / CLS **não medidos** | — |
| N-12 | não existe modo de densidade (confortável/compacto) | — |
| N-13 | não existe sistema de movimento único; 5 arquivos honram `prefers-reduced-motion` | 5 |

## O QUE NÃO FOI FEITO NESTA RODADA, E EU NÃO VOU DIZER QUE FOI

| pedido | estado |
|---|---|
| teste com usuário que não conhece o sistema | **não executado** — exige uma pessoa |
| teste com usuário experiente | **não executado** — mesma razão |
| ambiente de demonstração com dados fictícios | **não construído** — criar dados de demonstração na base viva contamina a produção, e não existe segundo ambiente |
| medição de LCP/INP/CLS | **não executada** |
| revisão pixel a pixel das 16 superfícies | **não executada** |
| modos de densidade | **não construídos** |
| sistema de movimento | **não construído** |
| redução de cliques medida antes/depois | **não medida** — ver `RELATORIO_DE_REDUCAO_DE_CLIQUES.md` |

## LIMITAÇÕES EXTERNAS

| # | limitação |
|---|---|
| E-01 | Não existe ambiente de homologação. `atlas-v3-homologacao` **é** produção |
| E-02 | Sem rede de segurança: `supabase db push` está fora com 177 migrations contra o schema vivo |
| E-03 | A Graph API recusa consultar a campanha que produziu as 24 leads (`#10`) |
