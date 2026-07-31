# IMPLANTAÇÃO NA HOSTINGER

**2026-07-31.** Modelo de implantação **verificado no projeto**, não presumido.

## O MODELO CORRETO

| o que | valor | como sei |
|---|---|---|
| tipo | **aplicação Node.js de longa duração** | `start` é `next start`; não há `output: "export"` nem `"standalone"` |
| build | `node scripts/build.mjs` | `package.json` |
| start | `next start` (porta via `PORT`) | `package.json` |
| processo | **PM2** | `ecosystem.config.cjs` no repositório |
| Node | **>= 22.6 e < 27** | corrigido nesta rodada — ver abaixo |

> **Não serve hospedagem estática.** O produto tem 204 rotas de API, middleware de
> sessão e workers. Build estático não roda nada disso.

## ⚠️ O ACHADO QUE TERIA QUEBRADO A IMPLANTAÇÃO

`package.json` declarava `engines.node: ">=20.9 <21"`. **Está errado, e o erro é
consequente:**

- **36 scripts** usam `--experimental-strip-types` ou `--env-file`, que **não
  existem no Node 20.9** (chegaram no 22.6 e 20.6 respectivamente);
- `npm run test:contracts` — a cadeia de verificação inteira — **não roda** no
  engine declarado;
- se a Hostinger provisionar Node pelo `engines`, o servidor recebe uma versão
  em que o próprio verificador do produto não executa.

Tudo foi construído e testado em **Node v26.4.0**. O `engines` foi corrigido para
`>=22.6 <27` — a faixa em que o produto realmente foi provado.

**Confira a versão no servidor antes de instalar:**

```bash
node -v   # precisa ser >= 22.6
```

## PASSO A PASSO

```bash
ssh usuario@servidor
cd /var/www/atlas
unzip -o ~/atlas-one-vX.Y.Z-final-*.zip -d .
node -v                       # >= 22.6, senão pare aqui
npm ci
cp .env.production.example .env      # e PREENCHA — o pacote não traz valores
nano .env
npm run build
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
```

> **NUNCA copie o `.env` da máquina de desenvolvimento.** Já houve um runbook
> mandando fazer isso, e o `.env.hostinger` daquela época tinha o
> `META_APP_SECRET` com 9 caracteres (placeholder). Provado à época: com o
> placeholder, `/api/webhooks/meta` responde **401**; com o segredo real, **200**.
> Seguir a instrução errada derruba a integração da Meta.

## O AGENDAMENTO — três caminhos, e a escolha é do plano contratado

As rotas de worker exigem apenas o cabeçalho `authorization: Bearer $ATLAS_CRON_SECRET`.
Qualquer um dos três funciona:

| caminho | quando usar |
|---|---|
| **cron do sistema** | plano com acesso a `crontab`. `bash scripts/operations/install-cron.sh` |
| **PM2 `cron_restart`** | plano sem cron, mas com PM2 |
| **agendador externo** | sem nenhum dos dois: qualquer serviço que faça POST autenticado |

**Não escolhi por você** — depende do plano, que eu não tenho como consultar.

## PROVA DE QUE FUNCIONOU

```bash
curl -s https://SEU-DOMINIO/api/v1/ready | head -c 400
npm run commit-publicado:check
bash scripts/operations/verify-after-5-minutes.sh
```

O sinal não é o comando ter rodado: é `/api/v1/ready` passar a declarar `build.commit`
igual ao aprovado, e um evento da fila sair de `attempts=1` sozinho.

## ROLLBACK

```bash
pm2 stop all
unzip -o ~/atlas-one-<VERSAO-ANTERIOR>.zip -d .
npm ci && npm run build && pm2 reload ecosystem.config.cjs --update-env
```

Migrations: cada arquivo em `supabase/migrations/` tem o rollback declarado no
cabeçalho. **Não há rollback de dado** — a base é produção sem espelho.
