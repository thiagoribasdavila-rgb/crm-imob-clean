# Guia de implantação — Hostinger

**Tipo:** aplicação **Node.js** (Next.js 16, App Router, com rotas de API e
workers). Não é site estático: exige processo Node em execução.

| item | valor |
|---|---|
| Node | **>= 20.9 < 21** (`engines` do `package.json`) |
| Gerenciador | **npm** — há `package-lock.json`. Não misture pnpm/yarn |
| Porta | `process.env.PORT` (o `next start` respeita) |
| Domínio | `https://atlasaios.com.br` |

---

## 1. Subir o código

Extraia `atlas-one-producao-final.zip` no diretório da aplicação. O ZIP cria a
pasta `atlas-one/`.

## 2. Variáveis de ambiente

Crie o `.env` **no servidor** (nunca no ZIP, nunca no Git) com as **9
obrigatórias** — a lista completa está em `docs/entrega/VARIAVEIS_DE_AMBIENTE.md`.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ATLAS_BASE_URL=https://atlasaios.com.br
ATLAS_CRON_SECRET=            # openssl rand -base64 32
```

> **`NEXT_PUBLIC_*` é fixada no build.** Defina antes de buildar; alterá-la
> depois exige **rebuild**, não basta reiniciar.

## 3. Instalar e buildar

```bash
npm ci
npm run build
```

`npm ci` (não `npm install`) para reproduzir exatamente o lock validado.

## 4. Iniciar

```bash
npm run start
```

Configure o painel da Hostinger para:

| campo | valor |
|---|---|
| Comando de instalação | `npm ci` |
| Comando de build | `npm run build` |
| Comando de início | `npm run start` |
| Arquivo de entrada | gerenciado pelo `next start` |

## 5. Aplicar as migrations

No SQL Editor do Supabase, na ordem dos nomes de arquivo, o que ainda não foi
aplicado em `supabase/migrations/`. Todas são incrementais e idempotentes.

> Verifique antes o que já está aplicado. Reaplicar é seguro (todas usam
> `if not exists` / `on conflict`), mas conferir evita susto.

## 6. Instalar o cron dos workers — **etapa obrigatória**

Sem isto **a fila não anda**: nada sai do outbox, nenhum lembrete dispara e o
vigia de SLA de primeiro contato nunca roda.

```bash
npm run workers:crontab
```

Copie a saída para `crontab -e`, trocando `CAMINHO_DO_PROJETO`.
`ATLAS_BASE_URL` e `ATLAS_CRON_SECRET` precisam estar **no ambiente do cron** —
se estiverem só no `.env` da app, o cron não os enxerga.

Conferir:

```bash
node scripts/run-workers.mjs first-contact-sla
```

Esperado: JSON com `"status":200`. Se vier **401**, o segredo do cron não bate
com o da aplicação.

## 7. Webhook da Meta

Aponte para `https://atlasaios.com.br/api/webhooks/meta`, campo `leadgen`.
A verificação (GET com `hub.challenge`) já responde 200 — validada.

## 8. Validar a implantação

```bash
curl https://atlasaios.com.br/api/health
curl https://atlasaios.com.br/api/ready
npm run integrations:health
```

- `/api/health` → `200` significa aplicação de pé.
- `/api/ready` → `503` enquanto integrações faltarem. **Isso é correto**, não é
  falha: ele reporta o estado real em vez de fingir prontidão.
- `integrations:health` → estado de cada credencial, com **chamada real** e
  valores mascarados.

## 9. Reiniciar

Pelo painel da Hostinger (Restart), ou o gerenciador de processos configurado.
Após mudar qualquer `NEXT_PUBLIC_*`: **rebuild**, não só restart.

---

## Ordem recomendada de ativação

1. **Subir e validar `/api/health`** — nada mais importa antes disso
2. **Instalar o cron** — é o que faz o sistema funcionar sozinho
3. **Uma chave gratuita de IA** (Gemini leva ~2 min) — devolve briefing e copy
4. **Liberar `ads_read`** na conta de anúncios — destrava gasto, CPL e CAC
5. **Definir a regra de distribuição** — sem ela, lead nova nasce órfã com o
   relógio correndo
6. **Ativar formulários da Meta em ondas** — 116 leads represadas para 3
   corretores é SLA nascido vencido

## Rollback

O repositório mantém `atlas-one-v100-pre-complete-merge.bundle` (git bundle
completo) e o checkpoint `checkpoint/pre-unificacao-2026-07-24`. Para voltar:

```bash
git clone atlas-one-v100-pre-complete-merge.bundle atlas-restaurado
cd atlas-restaurado && git checkout checkpoint/pre-unificacao-2026-07-24
```

**Nenhuma migration desta entrega apaga dado.** Todas acrescentam coluna, índice
ou linha; as de dados usam `where not exists`.
