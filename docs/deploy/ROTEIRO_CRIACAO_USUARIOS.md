# Atlas V3 — Roteiro final: criação dos usuários oficiais

**Modo:** preparação. **NÃO executar** a criação até as 4 pré-condições estarem verdes.
**Invariantes:** não altera `leads`/`clientes`/`projetos`/`histórico`; **não apaga** usuários antigos (viram legado, bloqueados). Senha aleatória descartável + link de definição por e-mail; zero senha em código/arquivo/log.

---

## 1. Projeto Supabase alvo  ⚠️ preencher (não sei o ref do projeto novo)

| Campo | Valor | Regra |
|---|---|---|
| URL | `https://<REF_NOVO>.supabase.co` | **NÃO** pode ser `ietwopslgqxlenfyghqk` (esse é o antigo, com 17.151 leads) |
| project ref | `<REF_NOVO>` | pegar em Supabase → Project Settings → General |
| ambiente | `homologation` | `ATLAS_ENV=homologation` **e** `ATLAS_DATABASE_ENVIRONMENT=homologation` (o script se recusa a rodar fora disso) |

Confirmar antes de tudo:
```bash
node --env-file=.env -e "const u=process.env.NEXT_PUBLIC_SUPABASE_URL; if(u.includes('ietwopslgqxlenfyghqk')) throw new Error('APONTANDO PARA O BANCO ANTIGO'); console.log('alvo OK:', u)"
npm run database:connection:check   # exige homologation + SELECT 1
```

## 2. Migrations RBAC (57, em ordem)

- **Ordem:** exatamente `docs/deploy/rbac-chain.txt` (remediação das 5 tabelas canônicas → cauda até o bridge `20260717213000`).
- **Dependências (por que 57 e não menos):**
  - `commercial_role`, `reports_to` ← `20260716212459_commercial_hierarchy_and_bulk_transfer`
  - `access_role` + trigger de hierarquia definitivo ← `20260717200655_official_auth_rbac`
  - `full_name` (o script grava) ← `20260717213000_v3_legacy_runtime_schema_bridge` ← **este é o motivo do alvo ir até o bridge**
  - As 5 tabelas canônicas (`developments/properties/campaigns/opportunities/ai_insights`) ← a remediação `20260716210000`, senão a cauda falha por FK pendente.
- **Premissa:** banco novo com base aplicada até o corte `20260716083708`. Confirmar: `select max(version) from supabase_migrations.schema_migrations;` → deve dar `20260716083708`.
- **Comando de aplicação** (loop psql — **NÃO** usar `supabase db push`, aborta por histórico desalinhado):
```bash
HOMOLOG_URL="postgresql://postgres:SENHA@db.<REF_NOVO>.supabase.co:5432/postgres"
while read f; do echo ">>> $f"; psql "$HOMOLOG_URL" -v ON_ERROR_STOP=1 -f "supabase/migrations/$f" || { echo "FALHOU: $f"; break; }; done < docs/deploy/rbac-chain.txt
```
- Validar depois: `npm run audit:runtime-schema` (deve sair 0). Recomendado: aplicar a **cauda inteira** (Tier 2 do RUNBOOK) para um homolog completo — estas 57 já são metade.

## 3. Configuração no painel Supabase Auth

| Item | Onde | Valor |
|---|---|---|
| SMTP próprio | Auth → SMTP Settings | provedor real (o default tem rate-limit e não entrega os links) |
| Site URL | Auth → URL Configuration | `https://<NOVA_URL>` |
| Redirect | Auth → URL Configuration → Redirect URLs | incluir `https://<NOVA_URL>/auth/callback` |
| Leaked Password Protection | Auth → Policies | ativar (o modelo por link é compatível) |

Teste: envie um "esqueci a senha" para você mesmo e confirme que o e-mail chega.

## 4. Dry-run final (read-only, não escreve)

```bash
node --env-file=.env scripts/reset-official-auth-rbac.mjs
```
Aprova se imprimir `"mode":"dry-run"`, `"officialUsers":5`, **`"hierarchyValidated":true`** e "Simulação concluída." sem erro.

**Roster aprovado** (já no script; hierarquia validada 7/7 contra o trigger):

| Nome | E-mail | access_role | commercial_role | reporta a |
|---|---|---|---|---|
| Thiago Ribas D'Avila | thiago@atlasaios.com.br | director_decisor | director | — (raiz) |
| Senna | senna@atlasaios.com.br | director | manager | Thiago |
| Diego | diego@atlasaios.com.br | director | manager | Thiago |
| Luciano | luciano@atlasaios.com.br | director | manager | Thiago |
| Adolfo | adolfo@atlasaios.com.br | broker | broker | Diego |

Recovery: `thiagoribasdavila@hotmail.com` · Senha: aleatória descartável + link de definição.

## 5. Comando final de criação (executar só com as 4 verdes)

```bash
node --env-file=.env scripts/reset-official-auth-rbac.mjs --confirm=RESET_AND_INVITE_OFFICIAL_USERS
```
Efeito: cria/atualiza os 5 acessos, envia o link de definição de senha a cada um, aposenta os antigos como legado (bloqueados, **não excluídos**), grava `outputs/official-access-invites.txt` (só nome+e-mail, **sem senha**). Dados intactos.

**Validar após:** `npm run audit:auth-hierarchy` (0 violações) · login de cada um pelo link · perfil/role/RLS/dashboard por papel.
