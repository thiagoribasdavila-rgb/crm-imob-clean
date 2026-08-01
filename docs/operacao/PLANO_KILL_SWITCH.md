# PLANO DE KILL SWITCH

**Documento de desenho. Nenhum interruptor novo foi criado nesta fase.**

---

## O PRINCÍPIO, APRENDIDO NUM CASO REAL

> **Kill switch invisível é indistinguível de pane.**

Medido em 2026-07-30: a fila ficou **44h49m** entre enfileirar um evento e a
primeira tentativa. Ninguém percebeu, porque de fora um worker morto e um worker
pausado deixam a fila igualmente quieta. Foi por isso que o kill switch do outbox,
ao ser criado, nasceu com três exigências:

1. **devolve HTTP 200**, para o cron não disparar alarme sobre uma pausa intencional;
2. **não reclama linha nenhuma** antes de sair — reclamar e devolver incrementaria
   `attempts` por uma tentativa que nunca aconteceu;
3. **aparece em `/api/v1/ready`** como `paused_by_kill_switch`, com o motivo escrito.

O terceiro é o que separa governança de incidente.

---

## O QUE JÁ EXISTE E ESTÁ PROVADO

| interruptor | variável | efeito | provado |
|---|---|---|---|
| **Fila de saída** | `ATLAS_OUTBOX_PAUSADO=1` + `ATLAS_OUTBOX_PAUSADO_MOTIVO` | worker devolve `{pausado:true, processados:0}` | **sim** — servidor real, `estado: paused_by_kill_switch`, `exigeAcao: false` |

Contrato: `tests/contracts/estado-da-prontidao.test.mjs` (17/17), incluindo a
precedência **pausa vence parado**, sem a qual toda pausa viraria incidente.

---

## O QUE PRECISA EXISTIR ANTES DE QUALQUER IA CHEGAR AO NÍVEL 2

| interruptor | variável proposta | escopo | efeito exigido |
|---|---|---|---|
| **IA global** | `ATLAS_IA_PARADA=1` | toda decisão de IA | nenhum módulo decide; `/ready` publica `paused_by_kill_switch` |
| **Por módulo** | `ATLAS_FLAG_<MODULO>=0` | um módulo | o módulo some da resposta, sem erro |
| **Por organização** | coluna em `organizations` | um cliente | pausa sem afetar os outros |
| **Teto de custo** | `ATLAS_IA_TETO_DIARIO_BRL` | provider | ao atingir, cai para nível 1 |

**Regras que valem para os quatro:**

- **Padrão é DESLIGADO.** Variável ausente = módulo parado. Nunca o contrário.
- **A pausa é declarada**, com motivo obrigatório. Pausa sem justificativa vira
  pausa esquecida — e foi assim que as 44 horas passaram.
- **Aparece em `/api/v1/ready`.** Se não aparece, não existe.
- **Não apaga trabalho.** Pausar ≠ cancelar: o que estava na fila continua lá.
- **Religar é ato humano registrado**, nunca automático por tempo.

---

## ORDEM DE ACIONAMENTO NUM INCIDENTE

1. `ATLAS_IA_PARADA=1` — corta tudo de IA, o mais amplo e o mais barato.
2. `ATLAS_OUTBOX_PAUSADO=1` — se o problema é entrega, não decisão.
3. Flag do módulo específico — quando já se sabe qual é.
4. **Nunca** desinstalar o cron. Foi a decisão que ninguém lembrou de desfazer, e
   custou 44h49m. Para isso existe o kill switch.

Depois de qualquer acionamento, conferir:

```bash
curl -s https://atlasaios.com.br/api/v1/ready | grep -o '"estado":"[^"]*"'
```

Deve responder `paused_by_kill_switch` — **não** `unhealthy`. Se responder
`unhealthy`, o interruptor não está declarado, e aí você tem dois problemas.

---

## O QUE FALTA — declarado, não implementado

- `ATLAS_IA_PARADA` **não existe ainda**. Nenhum módulo de IA a consulta, porque
  nenhum módulo é chamado. Criá-la antes de existir consumidor seria criar um
  interruptor que não desliga nada.
- Pausa **por organização** exige coluna em `organizations` — migration aditiva, sem
  urgência enquanto houver uma só organização com operação.
- **Teto de custo** já tem base: `ai_usage_events` registra custo real (43 eventos,
  USD 0,011459 em 30 dias). Falta o limitador que **bloqueia**, não só registra.
