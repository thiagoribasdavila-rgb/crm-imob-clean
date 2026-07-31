# RUNBOOK — CRON, WORKERS E REINICIALIZAÇÃO NO SERVIDOR

**Status geral: `BLOCKED_BY_EXTERNAL_ACCESS`.**
Esta sessão não tem SSH. Nada abaixo foi executado no servidor. Os scripts foram
escritos, verificados sintaticamente e **testados no caminho de recusa** — todos se
negam a rodar fora do servidor.

---

## SITUAÇÃO DE CADA ITEM

| item | status | evidência |
|---|---|---|
| Worker do outbox (código) | **NOT_REQUIRED** — já correto | 13/13 na prova de fila; lock, retry, backoff, teto de 5, DLQ |
| Reivindicação atômica | **NOT_REQUIRED** — já corrigida | 13/13 na prova de relógio |
| Kill switch da fila | **NOT_REQUIRED** — já existe e é visível | build real: `paused_by_kill_switch`, `exigeAcao:false` |
| Instalação do cron | **BLOCKED_BY_EXTERNAL_ACCESS** | exige SSH |
| PM2 / sobrevivência a reboot | **BLOCKED_BY_EXTERNAL_ACCESS** | exige SSH |
| Prova automática em 5 min | **BLOCKED_BY_EXTERNAL_ACCESS** | depende do cron instalado |
| Publicar o build atual | **BLOCKED_BY_EXTERNAL_ACCESS** | produção não declara `estado` nem `build` — medido hoje |
| `.env` do servidor | **NEEDS_CONFIGURATION** | conferir com `preflight.sh`; **nunca** copiar o local |
| `/var/log/atlas` | **NEEDS_CONFIGURATION** | `install-cron.sh` cria |
| Edge Functions | **NOT_REQUIRED** | nenhuma em uso |

---

## OS SCRIPTS

Todos em `scripts/operations/`, com `set -euo pipefail`, `--dry-run`, código de saída
correto, e **recusa em macOS/Windows e sem `$ATLAS_APP_DIR`**.

| script | o que faz | altera |
|---|---|:--:|
| `preflight.sh` | responde "esta máquina pode receber a instalação?" | não |
| `install-cron.sh` | instala o agendamento, idempotente, preserva terceiros | sim |
| `install-workers.sh` | garante o processo PM2 (`startOrReload`) | sim |
| `health-check.sh` | lê `/api/v1/ready` e traduz o estado | não |
| `verify-after-5-minutes.sh` | **a prova**: evento sai de `attempts=0` sozinho | cria e apaga 1 evento sintético |
| `diagnostico.sh` | reúne o que se pergunta num incidente | não |
| `emergency-stop.sh` | pausa a fila **sem** desinstalar o cron | sim |
| `rollback.sh` | religa a fila · restaura crontab · lista backups | sim |

### Garantias que eles têm, e por quê

- **Nunca `crontab -r`.** Apagaria agendamento de terceiro — estrago silencioso que
  só aparece quando a tarefa do outro deixa de rodar. `install-cron.sh` filtra só o
  bloco Atlas e preserva o resto, informando quantas linhas preservou.
- **Backup antes de escrever**, sempre, com o caminho impresso.
- **Nenhum imprime valor de segredo** — só se a variável existe.
- **Recusam fora do servidor.** Em 2026-07-30 um crontab com 11 workers comerciais
  apontando para produção foi instalado num Mac de desenvolvimento. Não houve dano
  porque `/var/www/atlas/.env` não existia lá — acidente de caminho, não proteção.
  Agora é verificação.
- **Idempotentes**: rodar duas vezes não duplica cron nem processo.

---

## A SEQUÊNCIA — copiar, colar, e conferir o EFEITO

```bash
# ── 1. Publicar o build atual ──────────────────────────────────────────────
ssh root@85.209.93.32
cd /var/www/atlas
git fetch origin && git checkout claude/atlas-v3-entregas && git pull

# O .env NÃO é copiado do local. Edite AQUI, variável por variável:
nano /var/www/atlas/.env

npm ci && npm run build && pm2 reload all --update-env
```

```bash
# ── 2. Confirmar QUE VERSÃO subiu (o passo que ninguém faz) ────────────────
curl -s https://atlasaios.com.br/api/v1/ready | grep -o '"commit":"[^"]*"'
```

> Deve devolver o SHA aprovado, **sem** o sufixo `+arvore-suja`. Hoje devolve nada:
> a produção é anterior ao commit que introduziu o campo. É por isso que "está no
> ar" não podia ser afirmado até agora.

```bash
# ── 3. Pré-validar ANTES de instalar ───────────────────────────────────────
bash scripts/operations/preflight.sh
#   0 = pronto · 1 = impedimento (NÃO instale) · 2 = avisos
```

```bash
# ── 4. Instalar o agendamento ──────────────────────────────────────────────
bash scripts/operations/install-cron.sh --dry-run     # veja antes de aplicar
export ATLAS_AUTORIZA_INSTALAR_CRON="eu-confirmo-que-este-e-o-servidor"
bash scripts/operations/install-cron.sh
bash scripts/operations/install-workers.sh
```

```bash
# ── 5. A PROVA — e ela não é o comando ter saído certo ─────────────────────
bash scripts/operations/verify-after-5-minutes.sh
```

> Cria um evento com **tópico inexistente** (o worker cai no "Tópico não suportado";
> nenhuma mensagem sai, nenhuma lead é tocada), **não chama worker nenhum**, e
> espera. Sucesso = `attempts` sair de 0 sozinho em ≤ 5 min. O evento é removido no
> fim.

```bash
# ── 6. Sobreviver a reinicialização ────────────────────────────────────────
pm2 save
pm2 startup            # imprime um comando com sudo — execute o que ele mandar
sudo reboot            # opcional; depois do boot:
bash scripts/operations/health-check.sh
```

---

## CRITÉRIOS

**Sucesso** — os quatro, juntos:

1. `/api/v1/ready` devolve `build.commit` igual ao aprovado, sem `+arvore-suja`;
2. `estado` é `healthy` ou `degraded` — **nunca** `not_configured`;
3. `verify-after-5-minutes.sh` sai com **0**;
4. após `reboot`, `health-check.sh` continua respondendo.

**Falha** — qualquer um:

- `preflight.sh` sai 1;
- `verify-after-5-minutes.sh` sai 1 → o cron não executa;
- `estado` = `not_configured` → falta `ATLAS_CRON_SECRET`;
- `estado` = `unhealthy` sem pausa declarada.

---

## SE ALGO DER ERRADO

```bash
bash scripts/operations/emergency-stop.sh "descreva o motivo aqui"
bash scripts/operations/health-check.sh      # deve dizer paused_by_kill_switch
```

**Não desinstale o cron.** Foi a decisão que ninguém lembrou de desfazer e que
custou 44h49m de fila parada. O kill switch existe exatamente para isso, e ele
**aparece** na prontidão.

```bash
bash scripts/operations/rollback.sh --listar-backups
bash scripts/operations/rollback.sh --cron /tmp/atlas-crontab-antes-AAAAMMDD-HHMMSS.txt
bash scripts/operations/rollback.sh --religar-fila
```

---

## LOGS ESPERADOS

`/var/log/atlas/<worker>.log`, um por worker. O do outbox recebe uma linha a cada
2 minutos. **Log vazio depois de 5 minutos significa que o cron não está rodando** —
não que não havia trabalho: `curl -fsS` grava a resposta mesmo quando ela é vazia.
