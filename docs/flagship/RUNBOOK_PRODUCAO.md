# RUNBOOK DE PRODUÇÃO — ATLAS ONE

Comandos reais. **Nenhum valor secreto aparece aqui.**

## 🔴 O SISTEMA ESTÁ FORA — O QUE FAZER AGORA

```bash
curl -s https://atlasaios.com.br/api/v1/ready | head -c 300
```

Se vier `"estado":"banco_fora"`, a resposta **lista as variáveis que faltam**.
Siga `INCIDENTE_PRODUCAO_2026-07-31.md`. Resumo: criar o `.env`, **reconstruir**
(não basta reiniciar — `NEXT_PUBLIC_*` é assada no build), e provar com o smoke.

## OS SEIS COMANDOS DO DIA A DIA

```bash
pm2 status                                              # está de pé?
pm2 logs atlas-one --lines 100                          # o que ele diz
pm2 restart atlas-one --update-env                      # reiniciar
curl -s https://atlasaios.com.br/api/v1/ready           # saúde + integrações
curl -s https://atlasaios.com.br/api/version            # qual versão está no ar
bash scripts/production/rollback-release.sh             # voltar
```

## PUBLICAR UMA VERSÃO

```bash
bash scripts/production/prepare-release.sh                       # 1x por servidor
bash scripts/production/verify-build.sh atlas-one-....zip        # recusa pacote ruim
bash scripts/production/deploy-release.sh atlas-one-....zip <commit>
bash scripts/production/post-deploy-check.sh https://atlasaios.com.br <commit>
```

`deploy-release.sh` **testa a release nova numa porta interna antes de trocar o
symlink**. Se ela não responder, a ativa não é tocada.

## AS TRÊS PERGUNTAS QUE O OPERADOR PRECISA SABER RESPONDER

**1. Qual versão está no ar?**
```bash
curl -s https://atlasaios.com.br/api/version
```
`identidadeConfiavel: false` significa que o build não declarou commit — e aí
ninguém sabe o que está rodando.

**2. A aplicação alcança o banco?**
```bash
curl -s https://atlasaios.com.br/api/v1/ready | grep -o '"estado":"[^"]*"'
```
HTTP 200 na home **não** responde isso: a home vem do cache da CDN.

**3. A fila drena sozinha?**
```bash
bash scripts/operations/verify-after-5-minutes.sh
```
Um evento precisa sair de `attempts=1` sem ninguém mandar. Um evento já ficou
**44h49m** parado antes desta verificação existir.

## O QUE NUNCA FAZER

| nunca | por quê |
|---|---|
| copiar o `.env` de desenvolvimento | o `META_APP_SECRET` de lá tinha 9 caracteres (placeholder) e devolvia **401** em todo webhook |
| `supabase db push` | 180 migrations contra o schema vivo, sem espelho: é roleta |
| editar uma release já ativa | ela deixa de corresponder ao commit e o rollback perde sentido |
| rodar como root permanentemente | use o usuário `atlas` |
| confiar em HTTP 200 | pode ser cache, painel padrão ou build de meses atrás |

## DEPOIS DE REINICIAR O SERVIDOR

```bash
pm2 status && curl -s https://atlasaios.com.br/api/version
crontab -l | grep -c atlas        # esperado: 13
```

Se o PM2 não voltou: `pm2 startup && pm2 save`.
