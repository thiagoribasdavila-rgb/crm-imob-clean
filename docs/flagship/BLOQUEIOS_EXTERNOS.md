# BLOQUEIOS EXTERNOS

**2026-07-31.** Cada bloqueio foi **reconfirmado** agora, não copiado da rodada
anterior. Para cada um: o que já está pronto no repositório, o verificador que
prova o estado, e a ação humana exata.

## B-01 · O BUILD NÃO ESTÁ PUBLICADO

**Confirmado agora:**

```bash
npm run commit-publicado:check
# → a resposta NÃO declara `build`
```

**Pronto no repositório:** provenência do build assada em `next.config.ts` (`env`),
`/api/v1/ready` publicando `build.commit`, e o portão que compara aprovado × no ar.

**Ação humana:** SSH no servidor, `git pull`, `npm ci`, `npm run build`,
`pm2 reload all --update-env`. Passo a passo em `HOSTINGER_DEPLOY.md`.

**Prova de que funcionou:** `npm run commit-publicado:check` passa a verde.

## B-02 · O AGENDAMENTO NÃO ESTÁ INSTALADO

**Confirmado agora:** `npm run cron:validar` **recusa** nesta máquina —
plataforma `darwin`, sem `/var/www/atlas`, sem a autorização explícita. A recusa
é o comportamento correto.

**Pronto no repositório:** 13 workers versionados em
`config/workers-schedule.json`, gerador de crontab, instalador com porteiro de
três condições, e `verify-after-5-minutes.sh`.

> **Ressalva pedida no briefing:** o instalador assume **cron do sistema**. Se a
> Hostinger do plano contratado não oferecer cron, o caminho alternativo é PM2
> com `cron_restart`, ou um agendador externo chamando as rotas com
> `ATLAS_CRON_SECRET`. As rotas **já** aceitam qualquer um dos três — elas só
> exigem o cabeçalho. **Qual dos três usar não foi decidido**, porque depende do
> plano contratado, que eu não tenho como consultar.

**Ação humana:** no servidor,
`export ATLAS_AUTORIZA_INSTALAR_CRON="eu-confirmo-que-este-e-o-servidor"` e
`bash scripts/operations/install-cron.sh`.

## B-03 · O CRM LÊ A CONTA DE ANÚNCIOS ERRADA

**Confirmado agora, com dado:** a conta `act_2169318190556460` gastou
**R$ 3.612,01** em 7 campanhas e trouxe **0 leads**. As 24 leads atribuídas vêm
de `120251113236400624`, que **não está** entre as 10 campanhas dessa conta — e a
Graph API recusa consultá-la com `(#10) Application does not have permission`.

**Pronto no repositório:** o produto **se recusa** a calcular CPL cruzando as duas
pontas e explica por quê, na tela. `lib/marketing/reconciliacao-de-investimento.ts`
com 14 contratos.

**Não fiz, de propósito:** trocar a conta de anúncios automaticamente. Apontar o
CRM para outra conta sem alguém confirmar de quem ela é seria mover dinheiro de
lugar no relatório.

**Ação humana:** descobrir a qual conta pertence `120251113236400624`, confirmar
que ela é do mesmo tenant, e trocar `META_AD_ACCOUNT_ID` no ambiente do servidor.

## B-04 · A PÁGINA META NÃO ESTÁ COMPARTILHADA

**Estado:** a página `1115087091694606`, onde os anúncios publicam, não está no
Business Manager `488439536919148`.

**Ação humana:** Business Manager → Páginas → compartilhar a página com o System
User `ATLAS INTEGRACOES`. **Antes** de qualquer recarga de verba.

---

## O QUE **NÃO** ESTÁ BLOQUEADO POR TERCEIROS

Performance (LCP das 3 rotas), acessibilidade (104 alvos < 24 px), as 1.359 cores
cravadas, os 6 fluxos ponta a ponta não testados e os 3 engines não cobertos são
**trabalho de código**, não bloqueio externo. Não os listo aqui para não diluir
os quatro que realmente dependem de outra pessoa.
