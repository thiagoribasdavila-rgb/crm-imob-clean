# CHANGELOG — RODADA FLAGSHIP (2026-07-31)

Versão do pacote: **3.0.0-rc.2** · branch `claude/atlas-v3-entregas`

## O DINHEIRO PASSA A EXISTIR NO CRM
- `marketing_spend`: **0 → 94 linhas · R$ 3.612,01** importados da conta de anúncios
- worker `investimento-de-midia` (04:40), idempotente por índice único (org, campanha, dia)
- `fetchMetaDailyCampaignInsights` com `time_increment=1`; estado da campanha **lido** da Meta, não suposto

## O PRODUTO PASSA A RECUSAR NÚMERO SEM BASE
- reconciliação gasto × lead: CPL só existe onde as duas pontas são a **mesma** campanha
- corrigido `totals.spend / totals.leads`, que passou a estampar **CPL R$ 9** no dia em que houve dado
- rótulo "Campanhas com leads" → "Campanhas em atividade" (contava `leads > 0 OU gasto > 0`)

## A IA GANHA O PRIMEIRO AGENTE EM SOMBRA
- `ai_shadow_decisions`: **0 → 20**, todas **retidas**, nenhuma executada
- `ATLAS_SLA_AUTO_REASSIGN` deixa de ser decorativa; retenção dupla por construção
- teto vira **teto da fila**: o sistema mantém 20 esperando decisão e repõe quando alguém decide

## O PREDITIVO COMEÇA A ACUMULAR EVIDÊNCIA
- `conversion_feature_snapshots`: **0 → 370**, 0 duplicatas, faixa 0,03% a 2,52%
- Brier publicado ao lado do Brier do previsor trivial; acurácia **recusada** com <2 desfechos
- `created_by` passa a aceitar NULL: snapshot de worker não tem autor humano
- `predicted_probability` de `numeric(5,2)` → `numeric(9,6)`: a escala gravava 363 de 370 como `0.00`

## A LISTA DE LEADS PARA DE MENTIR POR OMISSÃO
- `?status=xpto` devolvia **HTTP 200 com lista vazia** sobre 482 leads — agora **400** com o vocabulário

## O PACOTE PASSA A SE SUSTENTAR SOZINHO
- contrato de exceções distingue "sumiu do repositório" de "é local por desenho" (`git check-ignore`)
- verificado adversarialmente: exceção podre **continua reprovando**

## MIGRATIONS (4, todas com rollback no cabeçalho)
`20260731120000` · `20260731140000` · `20260731150000` · (mais o índice de leitura por período)

## NÚMEROS
| | antes | depois |
|---|---:|---:|
| contratos executados | 1.114 | **1.191** |
| aprovados | 1.105 | **1.182** |
| falharam | 0 | **0** |
| pulados | 9 | **9** |
| portões | 220/220 | **220/220** |
