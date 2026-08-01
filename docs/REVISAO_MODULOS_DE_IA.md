# REVISÃO DOS OITO MÓDULOS DE IA

**2026-07-31. Somente leitura. Nada foi ligado, conectado ou ativado.**

Os módulos foram versionados no commit `bad0421c` — versionar resolve a **perda**,
não a **orfandade**. Esta revisão confirma em que estado eles ficaram.

---

## RESPOSTA ÀS PERGUNTAS DE SEGURANÇA

| pergunta | resposta | como foi medido |
|---|---|---|
| Executam ações externas? | **Não. Zero.** | `fetch(` e `https://` nos 8 arquivos: **0 ocorrências** |
| Consomem tokens sem autorização? | **Não. Zero.** | `openai`, `anthropic`, `perplexity`, `completions`, `messages.create`: **0 ocorrências** |
| Alteram leads? | **Não** | nenhum dos 8 escreve em `leads` |
| Tomam decisões automáticas? | **Não** | nenhum é chamado por worker, cron ou gatilho |
| Permanecem desligados? | **Sim** | ver a cadeia de consumo abaixo |

**O único que escreve no banco** é `registro-de-sombra` — e escreve exatamente o que
um registro de sombra deve escrever: o que a IA *teria* decidido, a decisão humana e
o resultado observado. Ele não tem consumidor, então nem isso acontece hoje.

*(Correção de uma medição minha: contei "1 escrita" em `previsao-aritmetica`. Era
`idsConhecidos.delete("")` — um `Set` em memória, linha 165. Zero escritas no banco.)*

---

## CLASSIFICAÇÃO

| módulo | linhas | consumidor de **produto** | escreve | externo | tokens | classificação |
|---|---:|---|:--:|:--:|:--:|---|
| `lib/ai/modo-sombra` | 278 | `registro-de-sombra` *(que é órfão)* | não | não | não | **completo e desligado** |
| `lib/ai/niveis-de-autonomia` | 307 | `registro-de-sombra` *(idem)* | não | não | não | **completo e desligado** |
| `lib/ai/registro-de-modelos` | 582 | rota `GET /api/v1/analytics/projecao-realizado` | não | não | não | **completo e desligado** |
| `lib/atlas/gemeo-digital` | 992 | rota `GET /api/v1/atlas/gemeo-digital` | não | não | não | **completo e desligado** |
| `lib/ai/registro-de-sombra` | 157 | **nenhum** | sim¹ | não | não | **órfão** |
| `lib/ai/previsao-aritmetica` | 375 | **nenhum** | não | não | não | **órfão** |
| `lib/crm/grafo-de-receita` | 387 | **nenhum** | não | não | não | **órfão** |
| `lib/integrations/estado-de-credencial` | 246 | **nenhum** | não | não | não | **órfão** |

¹ grava em tabela própria de sombra: o que a IA teria decidido, a decisão humana, o
resultado. É o propósito do módulo, e não acontece porque ninguém o chama.

**Nenhum é esqueleto, nenhum é "apenas contrato", nenhum é inseguro para ativação.**
Os oito têm 157 a 992 linhas, e 6 dos 8 têm contrato próprio.

---

## A CADEIA DE CONSUMO — duas mortas, duas alcançáveis

```
modo-sombra ──────────┐
                      ├──► registro-de-sombra ──► (nada)      CADEIA MORTA
niveis-de-autonomia ──┘

registro-de-modelos ──► GET /api/v1/analytics/projecao-realizado ──► (nenhuma tela)
gemeo-digital ────────► GET /api/v1/atlas/gemeo-digital ───────────► (nenhuma tela)
```

**Shadow Mode e níveis de autonomia estão numa cadeia que termina em nada.** Eles
importam para `registro-de-sombra`, que ninguém importa. São exatamente os controles
que qualquer decisão automática exige *antes* de ser ligada, e hoje não protegem
nada — porque não há nada para proteger.

As duas rotas alcançáveis foram verificadas:

| | `projecao-realizado` | `gemeo-digital` |
|---|---|---|
| métodos | **GET** apenas | **GET** apenas |
| autenticação | 2 verificações | 2 verificações |
| escritas no banco | **0** | **0** |
| chamadas externas | **0** | **0** |
| consumida por tela | **0** | **0** |

São leitura autenticada, sem efeito. Alcançáveis por quem tem credencial, mas
inofensivas.

---

## O QUE FALTA PARA CADA UM SER ATIVÁVEL — sem ativar nada

Registrado para a fase que decidir ligá-los, **não como plano desta rodada**:

| módulo | o que falta |
|---|---|
| `modo-sombra` + `niveis-de-autonomia` | um **chamador real** — algum agente que decida em sombra antes de decidir de verdade. Hoje a corrente existe e não está presa a nada |
| `registro-de-sombra` | ser chamado por esse agente; e a tabela de sombra precisa existir no schema *(não verificado nesta rodada)* |
| `previsao-aritmetica` | é baseline puro, sem estado. Ativar = consumir num painel. Não precisa de infraestrutura |
| `registro-de-modelos` | já alcançável; falta a tela e a política de qual versão vale |
| `gemeo-digital` | já alcançável; a auditoria anterior mostrou que **9 de 12 linhas** eram contas de teste e que `broker_capacity_limits` tem 0 linhas — a tela mostraria dado sem sentido |
| `grafo-de-receita` | as views e funções **existem no banco** (verificado); falta rota e tela |
| `estado-de-credencial` | falta ser consumido pela prontidão |

---

## VEREDITO

> Os oito estão **desligados de fato**, não por configuração: nenhum executa ação
> externa, nenhum consome token, nenhum altera lead, nenhum é acionado por
> automação. Quatro nem sequer têm consumidor.
>
> **Nada foi ligado nesta rodada.** Os controles de autonomia, o modo sombra e o
> registro de modelos permanecem íntegros e desconectados — que é o estado correto
> enquanto a Fase 3 não começar.
