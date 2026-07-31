# IMPLANTAÇÃO — HOSTINGER NODE.JS APP GERENCIADA

**2026-07-31.** Cenário **confirmado pelo dono no hPanel**, não presumido.

| | |
|---|---|
| serviço | aplicação **Node.js gerenciada** (não é VPS) |
| framework detectado | Next.js |
| Node | **20.x** |
| diretório raiz | `./` |
| publicação | **upload de ZIP pelo hPanel** |
| domínio | servido pelo **CDN da Hostinger** |

> **Não tente SSH nos IPs do domínio.** Eles são bordas de CDN e rotacionam.

## ⚠️ A CORREÇÃO QUE ESTE CENÁRIO EXIGIU — e que era um defeito meu

Eu havia declarado `engines.node: ">=22.6 <27"`. **Isso teria bloqueado este
deploy**: `npm ci` recusaria no Node 20 com `EBADENGINE`.

Medido depois que o cenário foi confirmado:

| o que | exige |
|---|---|
| `next` | **>=20.9.0** |
| `npm run build` (`node scripts/build.mjs`) | **nenhuma** flag de Node 22+ |
| `npm start` (`next start`) | nenhuma flag |
| código da aplicação | nenhuma API exclusiva de 22+ |

Os 4 scripts que usam `--experimental-strip-types` são `test:contracts`,
`cron:validar`, `cron:instalar` e `reactivation-governance:check` — **nenhum roda
na cadeia `npm ci → build → start`** que a Hostinger executa.

**`engines` agora é `">=20.9"`** — o que a aplicação precisa para instalar,
construir e servir. A exigência de 22.6+ é da bancada de verificação, e vive
aqui, no procedimento de quem verifica — não no portão de quem instala.

> **Consequência prática:** rode `npm run test:contracts` **na sua máquina**,
> antes de subir. Ele não roda no Node 20 da Hostinger, e isso é esperado.

---

# 1. AS VARIÁVEIS — cadastre no hPanel ANTES de construir

**hPanel → sua aplicação Node.js → Environment Variables** (ou "Variáveis de
ambiente"). Cadastre e **só então** dispare o build.

## 🔴 SEM ESTAS, O BUILD FALHA — e é assim que tem de ser

| variável | onde encontrar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → **Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → **anon / public** |

**Estas duas são gravadas no JavaScript do navegador durante o build.** Cadastrar
depois e reiniciar **não funciona** — é preciso construir de novo. Foi exatamente
isso que derrubou a produção em 31/07.

O build agora **para com exit 1** se elas faltarem, em vez de gerar um pacote que
sobe e não deixa ninguém entrar.

## 🔴 SEM ESTA, O SERVIDOR NÃO ALCANÇA O BANCO

| variável | onde encontrar |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → **service_role** |

> **NUNCA** com prefixo `NEXT_PUBLIC_`. Ela ignora RLS: no navegador, seria
> acesso total ao banco para qualquer visitante. Verificado no build atual:
> **0 arquivos** do bundle contêm esta chave.

## 🟡 SEM ESTA, OS 19 WORKERS RECUSAM TUDO

| variável | como gerar |
|---|---|
| `ATLAS_CRON_SECRET` | `openssl rand -hex 32` |

Falha fechada: sem ela toda rota de worker devolve **401**.

## 🟢 INTEGRAÇÕES — o CRM funciona sem elas

`META_APP_SECRET` · `META_ADS_ACCESS_TOKEN` · `META_AD_ACCOUNT_ID` ·
`META_LEAD_ACCESS_TOKEN` · `ATLAS_META_CAPI_ENABLED` · `WHATSAPP_ACCESS_TOKEN` ·
`WHATSAPP_PHONE_NUMBER_ID` · `OPENAI_API_KEY` · `ANTHROPIC_API_KEY` ·
`PERPLEXITY_API_KEY` · `TELEGRAM_BOT_TOKEN`

Cada uma desliga **só a sua** integração, e cada uma falha fechada por conta
própria. **Não bloqueiam o deploy.**

## ⚙️ AMBIENTE

| variável | valor |
|---|---|
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_APP_URL` | `https://atlasaios.com.br` |
| `ATLAS_BASE_URL` | `https://atlasaios.com.br` |
| `ATLAS_BUILD_COMMIT` | o commit curto do pacote — **sem ele ninguém sabe qual versão está no ar** |

---

# 2. O PROCEDIMENTO

| campo do hPanel | valor |
|---|---|
| **Build command** | `npm run build` |
| **Start command** | `npm start` |
| **Diretório raiz** | `./` |
| **Saída** | `.next` — **não** é site estático; `next.config.ts` não usa `output: "standalone"` nem `"export"` |
| **Node** | 20.x (>=20.9) |

**Ordem que importa:**

1. cadastrar as variáveis;
2. subir o ZIP;
3. **só então** disparar o build.

Inverter a ordem reproduz o incidente.

---

# 3. VALIDAÇÃO PÓS-DEPLOY — nesta ordem

```bash
curl -s https://atlasaios.com.br/api/version
```
→ `commit` preenchido e `identidadeConfiavel: true`.

```bash
curl -s https://atlasaios.com.br/api/v1/ready | head -c 300
```
→ **não** pode conter `"estado":"banco_fora"`.

```bash
bash scripts/production/smoke-test.sh https://atlasaios.com.br
```
→ **SMOKE APROVADO**.

**E o teste que mais importa:** abra `/login` num navegador anônimo. Precisa ter
**campo de senha**. Se aparecer "Esta instalação ainda não foi configurada", o
build saiu sem as variáveis públicas — **cadastre e construa de novo**.

> HTTP 200 na home **não** prova nada: ela vem do cache do CDN.

---

# 4. ROLLBACK

O hPanel guarda o histórico de implantações. **Reimplantar o ZIP anterior é o
rollback** — foi o que você fez hoje com `atlas-v3-completo-2026-07-30.zip`.

Guarde sempre o ZIP anterior. Como o deploy não aplica migration nenhuma
(`RELATORIO_MIGRATIONS_PRODUCAO.md`), voltar não deixa o banco incompatível.

**Depois do rollback**, rode o smoke: rollback sem verificação é troca de um
estado desconhecido por outro.

---

# 5. CACHE DO CDN

Publicou e a página velha continua? `x-hcdn-cache-status: HIT` indica cache do
edge. Faça purge no hPanel. **`/api/*` não é cacheada** (`cache-control:
no-store`) — por isso `/api/version` e `/api/v1/ready` são as fontes de verdade,
e a home não é.
