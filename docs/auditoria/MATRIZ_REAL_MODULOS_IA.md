# MATRIZ REAL DOS OITO MÓDULOS DE IA

**2026-07-31. Somente leitura. Nada foi ligado.**

> ⚠️ **DUAS CORREÇÕES PUBLICADAS EM 31/07, depois desta matriz:**
>
> 1. `estado-de-credencial` **não é órfão** — tem 2 consumidores
>    (`prontidao-das-integracoes` → `/api/v1/ready`, e `prontidao-generativa`).
>    Minha busca cobriu só o alias `@/…`; eles importam por caminho relativo com
>    extensão. Ver `REGISTRO_FALSOS_POSITIVOS.md` FP-07.
> 2. `registro-de-sombra` **deixou de ser órfão**: o vigia de SLA passou a
>    registrar em sombra a redistribuição que recomendaria. `ai_shadow_decisions`
>    saiu de 0 para 20 linhas, todas retidas, nenhuma executada.
>
> A lista real de órfãos hoje é **1**: `grafo-de-receita`.
Método: rastreamento de import → consumidor → rota → banco → tela, com verificação
do objeto e da tabela em cada elo.

---

## TABELA EXECUTIVA

| # | módulo | classificação | evidência decisiva | recomendação |
|---|---|---|---|---|
| 1 | `lib/ai/modo-sombra` | **D. órfão** | única cadeia termina em `registro-de-sombra`, que não tem consumidor | manter; ligar só na Fase 3 |
| 2 | `lib/ai/niveis-de-autonomia` | **D. órfão** | idem | manter; é pré-requisito de qualquer ativação |
| 3 | `lib/ai/registro-de-sombra` | **D. órfão** | 0 consumidores; escreve em `ai_shadow_decisions` (**0 linhas**) | manter; é o destino do Shadow Mode |
| 4 | `lib/ai/registro-de-modelos` | **B. funcional e desligado** | alcançável por `GET /api/v1/analytics/projecao-realizado`, autenticada, sem tela | manter desligado |
| 5 | `lib/ai/previsao-aritmetica` | **C. parcialmente conectado** | alcançada **via** `gemeo-digital` → rota; nenhum consumidor direto | manter |
| 6 | `lib/atlas/gemeo-digital` | **B. funcional e desligado** | alcançável por `GET /api/v1/atlas/gemeo-digital`, autenticada, sem tela | **não ligar** — dado de origem inválido, ver nota |
| 7 | `lib/crm/grafo-de-receita` | **D. órfão** | 0 consumidores; as views existem no banco | manter |
| 8 | `lib/integrations/estado-de-credencial` | **D. órfão** | 0 consumidores | candidato natural à prontidão |

**Nenhum é `A. funcional e habilitado`. Nenhum é `E. somente estrutura`. Nenhum é
`F. inseguro para ativação`.**

---

## A CADEIA, RASTREADA ELO A ELO

```
modo-sombra (278 l) ──────┐
                          ├──► registro-de-sombra (157 l) ──► ai_shadow_decisions
niveis-de-autonomia (307 l)┘         │                          (0 linhas, 1 policy)
                                     └──► CONSUMIDOR: nenhum   ◄── CADEIA MORTA

previsao-aritmetica (375 l) ──► gemeo-digital (992 l) ──► GET /api/v1/atlas/gemeo-digital
                                                            └─► leads, profiles,
                                                                commercial_presence (2),
                                                                broker_capacity_limits (0)
                                                            └─► TELA: nenhuma

registro-de-modelos (582 l) ──► GET /api/v1/analytics/projecao-realizado
                                  └─► ai_projection_ledger (0), prediction_drift_reports (8)
                                  └─► TELA: nenhuma

grafo-de-receita (387 l) ──────► CONSUMIDOR: nenhum
estado-de-credencial (246 l) ──► CONSUMIDOR: nenhum
```

**Correção de uma classificação minha anterior:** eu havia chamado
`previsao-aritmetica` de órfã. Ela é importada por `gemeo-digital`, que tem rota.
É **C — parcialmente conectada**, não D.

---

## DETALHAMENTO POR MÓDULO

### 1–3. A tríade do Shadow Mode

| campo | `modo-sombra` | `niveis-de-autonomia` | `registro-de-sombra` |
|---|---|---|---|
| linhas · exports | 278 · 13 | 307 · 18 | 157 · 5 |
| imports | `niveis-de-autonomia` | *(nenhum)* | admin, logger, os dois acima |
| consumidor real | `registro-de-sombra` | `registro-de-sombra` | **nenhum** |
| rota HTTP | — | — | — |
| tabelas lidas | — | — | `ai_shadow_decisions` |
| tabelas escritas | — | — | `ai_shadow_decisions` (**0 linhas**) |
| provider de IA | **nenhum** | **nenhum** | **nenhum** |
| worker · cron · trigger | — | — | — |
| feature flag | **0** | **0** | **0** |
| nível de autonomia | — | **37 referências** | 1 |
| kill switch | **3 referências** | — | — |
| custo potencial | **R$ 0** | **R$ 0** | **R$ 0** |
| estado real | desligado, sem consumidor final | idem | idem |

> Estes três **são** os controles de segurança: modo sombra, níveis de autonomia e o
> registro do que a IA teria decidido. Eles existem, são completos, e hoje não
> protegem nada — porque não há decisão automática para proteger. É o estado
> correto antes da Fase 3, não um defeito.

### 4. `registro-de-modelos` — B

582 linhas, 17 exports, **0 imports**. Alcançável por
`GET /api/v1/analytics/projecao-realizado` (138 linhas): `requireAccessContext`,
**2 verificações de rate limit**, lê `ai_projection_ledger` (0 linhas) e
`prediction_drift_reports` (8 linhas). **Nenhuma tela consome.**
4 referências a desligamento/pausa. Zero provider, zero escrita, zero custo.

### 5. `previsao-aritmetica` — C

375 linhas, 9 exports, 0 imports. **Baseline aritmético puro** — carga de equipe,
tempo até esgotar fila. Sem estado, sem banco, sem provider. Chega ao produto
**apenas** através de `gemeo-digital`.

### 6. `gemeo-digital` — B, e **não deve ser ligado**

992 linhas, 29 exports. Alcançável por `GET /api/v1/atlas/gemeo-digital` (275
linhas), autenticada, com rate limit. Lê `leads`, `profiles`,
`commercial_presence` (**2 linhas**) e `broker_capacity_limits` (**0 linhas**).

> **Recomendação: não ligar.** A auditoria anterior mediu que **9 de 12 linhas** do
> painel eram contas de teste (desativadas desde então), e `broker_capacity_limits`
> está vazia — a coluna "teto aplicado" seria nula em 100% das células. A tela
> mostraria dado sem significado. O impedimento é de **dado**, não de código.

### 7–8. `grafo-de-receita` e `estado-de-credencial` — D

`grafo-de-receita` (387 l, 17 exports): as 3 views e 8 funções `grafo_*`
**existem no banco** — mas nenhuma rota ou tela as consome.
`estado-de-credencial` (246 l, 9 exports): sem consumidor; é o candidato natural a
alimentar `/api/v1/ready`, que hoje deriva estado de credencial por outro caminho.

---

## AS SEPARAÇÕES QUE O BRIEFING PEDIU

| pergunta | resposta |
|---|---|
| Chamados pela **interface** | **nenhum** |
| Acessíveis **só por rota** | `registro-de-modelos`, `gemeo-digital` |
| **Importados mas nunca usados** | `modo-sombra`, `niveis-de-autonomia` (a cadeia morre) |
| **Sem consumidor** | `registro-de-sombra`, `grafo-de-receita`, `estado-de-credencial` |
| **Sem provider de IA** | **todos os 8** |
| **Somente leitura** | 7 de 8 |
| **Capazes de escrever** | apenas `registro-de-sombra` (`ai_shadow_decisions`, 0 linhas) |
| **Aparentam funcionar e terminam sem efeito** | `modo-sombra` e `niveis-de-autonomia` — completos, importados, e a cadeia termina em nada |

---

## SEGURANÇA — ZERO EM TODAS AS DIMENSÕES DE RISCO

| dimensão | medição nos 8 arquivos |
|---|---|
| `fetch(` e `https://` | **0** |
| `openai` · `anthropic` · `perplexity` · `completions` · `messages.create` | **0** |
| escrita em `leads` | **0** |
| acionamento por worker, cron ou trigger | **0** |
| Edge Functions | **0** |
| custo potencial hoje | **R$ 0** |

Nenhum consome token. Nenhum chama serviço externo. Nenhum altera lead.

**Nenhum tem feature flag** — e essa é a lacuna real: hoje eles estão desligados por
**ausência de consumidor**, não por controle. Ligar qualquer um exigiria primeiro
criar a flag. Ver `docs/operacao/PLANO_ATIVACAO_SEGURA_IA.md`.
