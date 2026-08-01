# Atlas V3 — Backup + validação isolada antes das 57 migrations

**Banco oficial:** `atlas-ai-crm-v1` / `ietwopslgqxlenfyghqk` — **17.151 leads reais**, 4 usuários, 2 orgs, base no corte `20260716083708`.
**Regra:** nunca aplicar as 57 migrations direto no oficial sem (1) backup e (2) validação numa cópia isolada. Todos os comandos são executados por **você** (eu não tenho a senha do Postgres nem crio branch).

Descubra a senha em: Supabase → Project Settings → Database → Connection string / Reset password.
Se `db.<ref>` for IPv6-only na sua rede, use o **Session Pooler**: host `aws-0-<regiao>.pooler.supabase.com`, porta `5432`, user `postgres.ietwopslgqxlenfyghqk`.

---

## Parte 1 — BACKUP (obrigatório, primeiro)

### Opção A (mais simples): snapshot gerenciado
Supabase → Database → **Backups** → criar backup / anotar o ponto de restauração (PITR). Zero comando, sem senha.

### Opção B (portátil): pg_dump completo (schema + dados)
```bash
OFICIAL="postgresql://postgres:SENHA@db.ietwopslgqxlenfyghqk.supabase.co:5432/postgres"
pg_dump "$OFICIAL" --no-owner --no-privileges -Fc -f atlas-oficial-backup.dump
# conferir que gerou (deve ter dezenas de MB por causa dos 17k leads)
ls -lh atlas-oficial-backup.dump
# restaurar SE precisar reverter:
# pg_restore --clean --if-exists --no-owner -d "$OFICIAL" atlas-oficial-backup.dump
```
> O `.dump` contém PII dos 17k leads — guarde fora do repo, em local seguro. **Não** commitar.

---

## Parte 2 — VALIDAR as 57 numa cópia isolada (antes do oficial)

Objetivo: provar que a cadeia aplica limpa **sobre o schema real**, sem tocar nos 17k leads. Escolha UM caminho.

### Caminho A — Local com Supabase CLI (sem custo) — recomendado
O `supabase start` sobe um Postgres local **com os roles do Supabase** (`authenticated`, `anon`, `service_role`) e o schema `auth` — necessários, porque as migrations fazem `grant ... to authenticated`. Um `postgres:17` cru **falha** nesses grants.
```bash
# 1. dump SÓ do schema (public + private) do oficial
pg_dump "$OFICIAL" --schema-only --no-owner --no-privileges --schema=public --schema=private -f schema-oficial.sql

# 2. subir stack local e restaurar o schema real
supabase start
LOCAL=$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')
psql "$LOCAL" -v ON_ERROR_STOP=1 -f schema-oficial.sql

# 3. aplicar as 57 EM ORDEM, parando no 1º erro
while read f; do echo ">>> $f"; psql "$LOCAL" -v ON_ERROR_STOP=1 -f "supabase/migrations/$f" || { echo "❌ FALHOU: $f"; break; }; done < docs/deploy/rbac-chain.txt

# 4. validar o alvo: as 4 colunas + org.active existem
psql "$LOCAL" -c "select
  bool_or(column_name='access_role') access_role,
  bool_or(column_name='full_name') full_name,
  bool_or(column_name='reports_to') reports_to,
  bool_or(column_name='commercial_role') commercial_role
  from information_schema.columns where table_schema='public' and table_name='profiles';"
psql "$LOCAL" -c "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='active') org_active;"

supabase stop   # descartar a cópia local
```
Se o loop parar em algum arquivo → me mande o nome + o erro; eu conserto a migration no repo e você re-valida. (É esperado: essa cauda nunca rodou em Postgres real.)

### Caminho B — Supabase branch (gerenciado, **tem custo de compute** — sua autorização)
```bash
supabase link --project-ref ietwopslgqxlenfyghqk
supabase branches create rbac-validate           # cria uma branch isolada
# aplicar as 57 na branch (loop psql contra a URL da branch, igual ao Caminho A passo 3)
# validar (passo 4); se OK:
supabase branches delete rbac-validate            # descartar
```
> Branch cobra por hora de compute. Não crio por você (custo + escrita). Só use se preferir o gerenciado ao local.

---

## Parte 3 — Só depois de validar: aplicar no oficial
1. Backup feito (Parte 1). ✅
2. Aplicar as 57 no oficial (mesmo loop, `OFICIAL` no lugar de `LOCAL`).
3. `ATLAS_AUTH_ORGANIZATION_ID` = a org oficial (há **2**; o script exige 1).
4. Dry-run (`node --env-file=.env scripts/reset-official-auth-rbac.mjs`) → me cola o resultado.
5. Criação (`--confirm`).

Invariantes o tempo todo: leads/histórico intactos; antigos = legado, não excluídos.
