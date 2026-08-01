# Runbook — Nova URL de homologação (espelho da prod) + remediação

**Alvo:** subir o Atlas v3 numa nova URL, com banco de homologação isolado (produção `ietwopslgqxlenfyghqk` **intocada**), e opcionalmente ligar as features novas (remediação já pronta no repo).
**Data:** 2026-07-20 · **HEAD:** `484a37c6` · **App:** Next.js 16.2.10 (servidor Node, `next start`), node `>=20.9 <21`.
**O que é seu (não faço por você):** provisionar Supabase de homolog (custo), dump/restore, editar `.env`, rodar o deploy no VPS, credenciais/login, aplicar migrations. Eu preparo os comandos e valido por leitura.

---

## 🔎 Nota de segurança (verificada — NÃO é bloqueador)

Uma auditoria automática sinalizou "segredos commitados". **Verifiquei diretamente e é falso positivo:**
- `.env.hostinger`, `hostinger.env`, `.env.local` são **gitignored** (`.env*` no `.gitignore`) e **não estão rastreados** — não vão para o `git push` nem para o ZIP (`git archive HEAD` só empacota arquivos rastreados).
- O ZIP selado contém **apenas `.env.example`** (catálogo de variáveis vazias), zero segredos.

**Portanto: `git push` e a distribuição do ZIP são seguros quanto a segredos.** ✅

Higiene local (não urgente, sem bloqueio): há chaves `sk-` reais em texto claro **no disco** desses arquivos locais. Só há risco se você copiar o diretório inteiro (incluindo não-rastreados) para um lugar não confiável. Boas práticas: manter os segredos só no `.env` do servidor (chmod 600) e gerar segredos **novos** para o homolog (passo 5) em vez de reaproveitar os locais.

---

## Tier 1 — Espelho-núcleo online (objetivo imediato: CRM real funcionando)

Sobe o CRM-núcleo (login, dashboard, leads, pipeline, command-center) com o schema **idêntico ao que roda hoje em produção**. As ~116 telas de feature ficam vazias/off (tabelas não existem) — Tier 2 as liga.

### 1. Provisionar o Supabase de homolog
Criar um **novo projeto Supabase** (ou branch) só para homolog. Guardar: `HOMOLOG_REF`, senha do Postgres, URL, anon/publishable key, service_role key. *(Custo de compute Supabase — sua autorização.)*

### 2. Clonar o SCHEMA da produção (sem dados)
Pré-req: senha do Postgres da **prod** (Supabase → Settings → Database). Se `db.<ref>` for IPv6-only na sua rede, use o Session Pooler (`aws-0-<regiao>.pooler.supabase.com:5432`, user `postgres.<ref>`).

```bash
# 2a. Dump só do schema (public + private), sem owners/privilégios
pg_dump "postgresql://postgres:PROD_PWD@db.ietwopslgqxlenfyghqk.supabase.co:5432/postgres" \
  --schema-only --no-owner --no-privileges --schema=public --schema=private \
  -f atlas-prod-schema.sql

# 2b. Restaurar no homolog
psql "postgresql://postgres:HOMOLOG_PWD@db.<HOMOLOG_REF>.supabase.co:5432/postgres" \
  -v ON_ERROR_STOP=1 -f atlas-prod-schema.sql
```

### 3. Re-aplicar o gatilho de auth (NÃO viaja no dump de `public`)
O trigger que transforma `auth.users` → `public.profiles` vive no schema `auth` (gerenciado pelo Supabase) e **não sai** num `pg_dump --schema=public`. Sem ele, signup não cria profile e o login efetivo quebra.

```bash
psql "<HOMOLOG_URL>" -f supabase/migrations/20260711224500_harden_auth_profile_provisioning.sql
psql "<HOMOLOG_URL>" -f supabase/migrations/20260711225500_grant_auth_trigger_execution.sql
```

### 4. Dados mínimos para login (2 orgs + 4 profiles)
Padrão = **sem dados**. Login exige ≥1 organization ativa + `auth.users` correspondentes (`profiles.id` é 1:1 com `auth.users.id` — copiar profiles sem os auth.users gera perfis órfãos). **Recomendado:** não copie dados; deixe o trigger criar a org `atlas-default` no 1º signup e semeie os acessos oficiais no passo 8.

### 5. Montar o `.env` do homolog (partir de `.env.hostinger-template`)
⚠️ Os 4 arquivos de env do repo apontam para a **PROD**. Para homolog é **obrigatório** trocar, senão o "homolog" escreve na produção (risco alto):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → do **homolog**.
- `DATABASE_URL` → Postgres do homolog (preferir Session Pooler, com senha).
- `ATLAS_BASE_URL` e `NEXT_PUBLIC_APP_URL` → a **nova URL**.
- `ATLAS_ENV=homologation`, `ATLAS_DATABASE_ENVIRONMENT=homologation`.
- Gerar `ATLAS_CRON_SECRET` e `ATLAS_BOOTSTRAP_SECRET` novos. **Nunca commitar este arquivo.**

Preflight: `bash scripts/validate-env-hostinger.sh` / `node scripts/preflight-production.mjs`.

### 6. Deploy no VPS
`scripts/atlas-go-live.sh` (rodar como root) faz 11 passos: firewall + usuário `atlas`, Node 20 + PM2, extrai o ZIP em `/var/www/atlas`, valida `.env`, `npm ci` → `prisma:generate` → `build`, PM2 (`next start -p 3000`), Nginx (proxy 443→3000) + certbot Let's Encrypt, cron dos workers, smoke em `/`, `/api/health`, `/api/ready`.

> ⚠️ **Hardcoded para `atlasaios.com.br`.** Para a nova URL, editar antes: `server_name` (bloco Nginx), `certbot -d`, o `EMAIL` do Let's Encrypt e o nome do ZIP no script. Hostinger precisa ser **VPS** (não hospedagem compartilhada) — o app exige processo Node persistente.

Build manual equivalente: `npm ci && npm run prisma:generate && npm run build && pm2 start ecosystem.config.cjs`.

### 7. Validação de runtime (read-only, não alteram nada)
```bash
npm run environments:check            # config de ambientes coerente
npm run environment:variables         # toda env usada no código está classificada
npm run database:connection:check     # ATLAS_ENV=homologation + SELECT 1 no Postgres
npm run audit:runtime-schema          # 8 superfícies e colunas existem no banco
npm run audit:release-data-compatibility
```

### 8. Auth + RBAC (o login é seu)
1. Deslogado, acessar rota protegida → deve redirecionar `/login?next=...` (proxy.ts, Next 16).
2. Semear a hierarquia oficial: `node --env-file=.env scripts/reset-official-auth-rbac.mjs` (dry-run primeiro, depois `--confirm=RESET_AND_INVITE_OFFICIAL_USERS`). Cria 6 acessos (admin, director_decisor=Thiago, director=Senna, 3 brokers) e grava senhas em `outputs/official-access-credentials.txt`. **Exige exatamente 1 org ativa** (ou `ATLAS_AUTH_ORGANIZATION_ID`).
3. `npm run audit:auth-hierarchy` → exigir `authUsersWithoutProfile=0`, `profilesWithoutAuthUser=0`, `hierarchyViolations=0`.
4. Login fim-a-fim: `/login` → `/api/v1/auth/me` retorna sessão+perfil+org → redirect `/dashboard`.
5. SMTP próprio + Site URL/Redirect (`nova-url/auth/callback`) no Supabase Auth; testar "esqueci a senha". Ativar Leaked Password Protection.

**✅ Fim do Tier 1:** CRM-núcleo online com os papéis reais, prod intocada.

---

## Tier 2 — 10/10 completo (ligar as ~116 telas de feature)

A migration de remediação (`20260716210000_atlas_v3_canonical_base_tables.sql`, commit `484a37c6`) cria as 5 tabelas-base canônicas ausentes. Com ela, a cauda (16→20/07) passa a ser aplicável sobre o dump. Prova estática: gap de tabelas = 0 (`scratchpad/validate-migration-chain.mjs`).

### Mecânica (NÃO usar `supabase db push` — histórico desalinhado aborta)
Aplicar a cauda manualmente, em ordem de nome, sobre o homolog já espelhado (Tier 1, passos 1-3):

```bash
HOMOLOG_URL="postgresql://postgres:HOMOLOG_PWD@db.<HOMOLOG_REF>.supabase.co:5432/postgres"
for f in $(cd supabase/migrations && ls *.sql | awk '$0 > "20260716083708"' | sort); do
  echo ">>> $f"
  psql "$HOMOLOG_URL" -v ON_ERROR_STOP=1 -f "supabase/migrations/$f" || { echo "❌ FALHOU em $f"; break; }
done
```

### Expectativa honesta
Essa cauda (110 migrations) **nunca foi aplicada a um Postgres real** — o loop acima **é** a validação definitiva. É esperado parar em algum erro (função, policy, tipo, ordem) que a análise estática não pega. **Quando parar: me mande o arquivo + o erro que eu corrijo a migration no repo, e repetimos até `for` rodar limpo.** Esse é o caminho real para o 10/10 completo.

Depois de a cauda aplicar limpa: rodar `npm run audit:runtime-schema` (deve sair 0) e navegar as telas de feature.

---

## Riscos / decisões abertas
- **Segredos** — não é bloqueador (arquivos gitignored, fora do git/ZIP); gerar segredos novos para o homolog.
- **Env aponta para prod** — trocar as 6 variáveis Supabase/URL para o homolog (risco de escrever na prod).
- **URL hardcoded** — editar env + Nginx `server_name` + certbot `-d`/EMAIL para a nova URL.
- **Hostinger tem que ser VPS** — hospedagem compartilhada não roda Node persistente.
- **`developer_id`/`typology_id`** ficaram como uuid sem FK (tabelas-alvo nascem em phases posteriores); integridade dessas 2 colunas pode ser reforçada por migration tardia após aplicar a cauda.
- **Importação CSV/XLSX** — fase seguinte, só após deploy confirmado (dedup contra os 17.151 leads já existentes).
