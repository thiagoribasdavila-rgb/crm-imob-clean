# IMPLANTAÇÃO PASSO A PASSO — HOSTINGER NODE.JS APP

**Alvo confirmado:** aplicação Node.js gerenciada, Node 20.x, raiz `./`, upload
de ZIP pelo hPanel. **Não é VPS.**

> ⛔ **Não execute nada disto sem a autorização explícita**
> `DEPLOY RC.2 AUTORIZADO`. O pacote está congelado.

---

## PASSO 0 — antes de tocar em qualquer coisa

**Guarde o ZIP que está em operação.** Ele é o seu rollback.

| campo | valor |
|---|---|
| arquivo | `atlas-v3-completo-2026-07-30.zip` |
| local | `~/Downloads/` |
| SHA-256 | `58eb23d25d6376513aa53f608b0b485f364cf167be6c8d9280593a6f61a4f0a3` |

Anote o horário e o estado atual:

```bash
curl -s https://atlasaios.com.br/api/v1/ready | head -c 200
date -u
```

## PASSO 1 — conferir o pacote novo

```bash
cd ~/atlas-v3-releases
shasum -a 256 -c atlas-one-v3.0.0-rc.2-hostinger-20260731-1250-41ebf2fc.zip.sha256
```

Precisa dizer **OK**. Se não disser, **pare** — o arquivo não é o aprovado.

## PASSO 2 — cadastrar as variáveis **antes** do build

hPanel → aplicação Node.js → **Environment Variables**.

Cadastre os grupos A, B, C e D de `ENVIRONMENT_VARIABLES_HOSTINGER.md`.
`ATLAS_BUILD_COMMIT` = `41ebf2fc`.

> **Este passo vem antes do upload.** As variáveis `NEXT_PUBLIC_*` são gravadas
> no bundle durante o build; cadastrar depois e reiniciar não funciona.

## PASSO 3 — subir o ZIP

hPanel → aplicação → **Deploy / Upload**, selecione o pacote.

Confira antes de disparar o build:

| campo | valor |
|---|---|
| Build command | `npm run build` |
| Start command | `npm start` |
| Diretório raiz | `./` |
| Node | 20.x |

## PASSO 4 — construir

Dispare o build e **acompanhe o log**.

**Se aparecer `✘ BUILD RECUSADO`:** faltou variável do grupo A. A mensagem diz
qual. Cadastre e construa de novo — **não** tente contornar. Essa recusa é a
proteção que impede o incidente de 31/07 de se repetir.

**Se aparecer `⚠️ build SEM configuração pública do Supabase`:** o artefato saiu
com placeholder e **não serve**. Mesma correção.

## PASSO 5 — validar **antes** de considerar publicado

Siga `POST_DEPLOY_VALIDATION.md`. Resumo:

```bash
curl -s https://atlasaios.com.br/api/version
curl -s https://atlasaios.com.br/api/v1/ready | head -c 300
bash scripts/production/smoke-test.sh https://atlasaios.com.br
```

**E abra `/login` numa aba anônima.** Precisa ter **campo de senha**.

## PASSO 6 — se algo falhar

`ROLLBACK_PRODUCTION.md`. Reimplantar o ZIP anterior pelo hPanel.

---

## O QUE ESTE DEPLOY **NÃO** FAZ

| não faz | por quê |
|---|---|
| não aplica migration | a Hostinger roda só `npm ci → build → start`; `build.mjs` lê nomes de arquivo, não conecta em banco |
| não altera dados | nenhum hook de npm; o único script com `reset` não está na cadeia |
| não mexe em DNS | o domínio já aponta para o CDN |
| não altera Supabase | nada no deploy escreve schema |

## O QUE PODE DAR ERRADO — e o sinal de cada um

| sintoma | causa provável | correção |
|---|---|---|
| build para com `BUILD RECUSADO` | falta variável do grupo A | cadastre e construa de novo |
| `/login` sem campo de senha | build saiu sem `NEXT_PUBLIC_*` | cadastre e **reconstrua** |
| `/api/v1/ready` diz `banco_fora` | falta `SUPABASE_SERVICE_ROLE_KEY` | cadastre e reinicie |
| `/api/version` sem `commit` | faltou `ATLAS_BUILD_COMMIT` | cadastre e reconstrua |
| workers respondem 401 | falta `ATLAS_CRON_SECRET` | cadastre e reinicie |
| página velha continua | cache do CDN | purge no hPanel |
| `npm ci` falha com `EBADENGINE` | Node abaixo de 20.9 | ajuste a versão no hPanel |
