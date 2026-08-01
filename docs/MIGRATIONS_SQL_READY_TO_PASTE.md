> ⚠️ **O projeto mudou.** Este roteiro apontava para `atlas-ai-crm-v1` (`ietwopslgqxlenfyghqk`) — projeto **APOSENTADO**, com 17.151 leads reais dentro. Aplicar migrations lá conecta a operação no banco errado. O ref canônico vive em `config/supabase-projetos.json` e é conferido por `npm run coerencia-ambiente:check`.

# 4 Migrations — Pronto para copiar/colar no Supabase SQL Editor

Projeto: **`atlas-v3-homologacao` (`pozbrcsfthnhmnebfoxv`)**

---

## ANTES: Fazer backup

Supabase Dashboard → Backups → **Create Manual Backup** (as 4 são aditivas e reversíveis, mas backup é regra)

---

## Migration 1: Portal Lead Ingestion
Execute esta query no Supabase SQL Editor:

```sql
