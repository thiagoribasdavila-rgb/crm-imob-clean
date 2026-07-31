# INCIDENTE EM PRODUÇÃO — 2026-07-31T14:13:24Z

# 🔴 O CRM ESTÁ FORA DO AR PARA OS USUÁRIOS

Descoberto durante o diagnóstico pré-deploy, **sem nenhuma alteração minha em
produção**. Eu não causei e não corrigi: não tenho acesso SSH nesta sessão.

## O SINTOMA, MEDIDO

| rota | resposta |
|---|---|
| `/api/v1/auth/me` | **HTTP 500** |
| `/api/v1/crm/leads` | **HTTP 500** |
| `/api/v1/analytics/sala-de-comando` | **HTTP 500** |
| `/login` | HTTP 200, **sem campo de senha**, com texto de erro na página |
| `/leads` · `/command-center` | HTTP 307 (redireciona para login, que não funciona) |
| `/` | HTTP 200 — **servida do cache da CDN** (`x-nextjs-cache: HIT`) |

**Ninguém consegue entrar no sistema.** A home parecer normal é o cache da CDN
servindo uma página estática antiga.

## A CAUSA, QUE A PRÓPRIA APLICAÇÃO DECLARA

```
GET https://atlasaios.com.br/api/v1/ready

{
  "status": "not_configured",
  "estado": "banco_fora",
  "estadoMotivo": "Faltam 2 variável(is) de ambiente obrigatória(s).",
  "variaveisAusentes": ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
}
```

**A aplicação subiu sem as variáveis do banco.**

## A LINHA DO TEMPO — houve um deploy nas últimas horas

| momento | `/api/v1/ready` respondeu |
|---|---|
| ~14:06 UTC | `"status":"ready"` · `"database":{"ok":true,"latencyMs":65}` |
| ~agora | `"status":"not_configured"` · `"estado":"banco_fora"` |

A segunda resposta **é código meu**, do commit `d87d2f1e` (hoje). A primeira era
de um build anterior a 30/07.

> **Alguém publicou uma versão nova entre as duas medições, sem o arquivo de
> ambiente.** Confirmado em **10 de 10 sondagens seguidas** — não é intermitência,
> não é cache: é o estado atual.

## POR QUE  DERRUBA O LOGIN

Variáveis `NEXT_PUBLIC_*` são **assadas no bundle durante o build**. Faltando no
build, o navegador não recebe o endereço do Supabase — e a tela de login não tem
para onde autenticar. Por isso ela carrega e **não tem campo de senha**.

**Consequência:** não basta criar o `.env` e reiniciar. **É preciso construir de
novo** com as variáveis presentes.

## O QUE FAZER — na ordem

### 1. Decidir: consertar ou voltar

Se existe a release anterior no servidor, **rollback é mais rápido e devolve o
sistema aos usuários imediatamente**:

```bash
bash scripts/production/rollback-release.sh
```

Se não existe estrutura de releases, siga para o passo 2.

### 2. Criar o arquivo de ambiente no servidor

```bash
cp .env.production.example .env    # e PREENCHA — o pacote não traz valores
```

**Nunca copie o `.env` da máquina de desenvolvimento.** Ver
`HOSTINGER_ENV_CHECKLIST.md`.

### 3. Validar ANTES de construir

```bash
set -a; . ./.env; set +a
node scripts/validate-production-env.mjs
```

Só siga com `✔ Ambiente apto a subir`.

### 4. Reconstruir — obrigatório

```bash
export ATLAS_BUILD_COMMIT=$(git rev-parse --short HEAD)   # ou o commit do pacote
npm ci && npm run build && pm2 reload all --update-env
```

### 5. Provar

```bash
bash scripts/production/smoke-test.sh https://atlasaios.com.br
```

Precisa dar **SMOKE APROVADO**. Enquanto der reprovado, o CRM segue fora.

## O QUE ESTE INCIDENTE PROVA SOBRE O TRABALHO DE HOJE

O guarda que descobriu isto foi escrito **hoje**, no commit `d87d2f1e`, porque o
smoke test do pacote extraído pegou `/api/v1/ready` respondendo **HTTP 500 cru**
sem `.env`. A correção fez a rota **nomear o que falta** em vez de quebrar.

Sem essa correção, este incidente apareceria como **500 opaco** — e a causa
levaria horas para ser encontrada. Com ela, a própria aplicação diz, em uma
linha, exatamente quais duas variáveis faltam.

**A régua "ausência declarada, nunca silenciosa" pagou por si mesma em menos de
um dia.**
