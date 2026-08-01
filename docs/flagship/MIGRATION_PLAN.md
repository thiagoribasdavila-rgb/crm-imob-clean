# PLANO DE MIGRATIONS

**2026-07-31.** 180 arquivos em `supabase/migrations/`.

## ⚠️ A REGRA QUE VALE MAIS QUE O PLANO

> **`supabase db push` está FORA.**

Com 180 migrations contra o schema vivo, ele não é reconstrução — é roleta.
`atlas-v3-homologacao` **é** a produção; não existe ambiente espelho, e não há
rollback de dado.

## O ESTADO REAL

| medida | valor |
|---|---:|
| migrations no repositório | **180** |
| registradas no banco | 223 |
| **drift de schema real** | **0** |
| existem só no banco, sem arquivo | **15** |
| equivalências declaradas com evidência | 4 |

As 4 equivalências estão em `config/migrations-equivalencias.json`, **cada uma
verificada pelo objeto no schema** — não por casamento de nome, que trocaria
falso vermelho por falso verde.

**As 15 só-no-banco são a dívida real:** por causa delas um clone limpo não
reconstrói a base. **4 delas são ambíguas** por tocarem em `GRANT`, RLS ou
trigger — as três áreas que produziram a escalação de privilégio de 30/07. Ler
antes de versionar.

## AS 4 DESTA LINHA DE TRABALHO

| arquivo | o que faz | rollback |
|---|---|---|
| `20260731120000` | índice único (org, campanha, dia) em `marketing_spend` | `drop index` |
| `20260731140000` | `created_by` aceita NULL em `conversion_feature_snapshots` | `delete where created_by is null` **e depois** `set not null` |
| `20260731150000` | `predicted_probability` de `numeric(5,2)` → `numeric(9,6)` | `alter … type numeric(5,2)` |
| (índice de leitura por período) | `marketing_spend (org, spend_date desc)` | `drop index` |

**Todas aplicadas via MCP, todas idempotentes** (`if not exists`), **todas com o
rollback no cabeçalho do arquivo**.

> O rollback da `20260731140000` **precisa** do `delete` antes do `set not null`
> — sem ele, falha. Um contrato guarda isso: rollback que não roda não é rollback.

## COMO APLICAR NUMA BASE NOVA

Não use `db push`. Aplique **em ordem de nome**, uma por uma, conferindo o objeto
criado depois de cada uma. As 15 só-no-banco precisam ser extraídas antes — sem
elas o schema fica incompleto e o erro só aparece em tempo de execução.

## VERIFICADOR

```bash
npm run migrations:matriz     # repo × banco, comparado por NOME
```

Comparar por `version` dá falso vermelho permanente: `version` é o carimbo de
aplicação e nunca coincide com o prefixo do arquivo. Foi assim que "109
migrations faltando" nasceu, e 105 delas eram falsas.
