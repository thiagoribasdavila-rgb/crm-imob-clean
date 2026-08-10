# Atlas One V1000 — backup e restauração

## Prova executada nesta fase

- O schema remoto foi lido integralmente e convertido em snapshot tipado (aproximadamente 447 KB), cobrindo tabelas, views e relações expostas.
- Foram conferidas contagens de Auth, perfis, organizações, policies, triggers, funções e Storage antes e depois da reconciliação.
- O banco manteve 1 usuário Auth, 1 perfil, 2 organizações e 0 objetos de Storage.
- As alterações aplicadas foram somente DDL aditivo/restritivo e idempotente.

Esta é uma **validação estrutural compatível**, não uma restauração sobre a homologação. Nenhum segredo foi exibido.

## Limite factual

Um dump lógico portátil de dados não foi produzido nesta máquina porque `DATABASE_URL` não está preenchida no ambiente local e não há `pg_dump`/Docker disponível. O ZIP não declara uma restauração completa como aprovada. O dump deve ser executado localmente com a variável segura antes de uma promoção para produção.

## Backup seguro

Execute com `DATABASE_URL` apenas no ambiente do terminal:

```bash
export BACKUP_DIR=".private-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
supabase db dump --db-url "$DATABASE_URL" --role-only -f "$BACKUP_DIR/roles.sql"
supabase db dump --db-url "$DATABASE_URL" -f "$BACKUP_DIR/schema.sql"
supabase db dump --db-url "$DATABASE_URL" --data-only --use-copy -f "$BACKUP_DIR/data.sql"
shasum -a 256 "$BACKUP_DIR"/*.sql > "$BACKUP_DIR/SHA256SUMS"
```

`.private-backups/` não deve ser versionado nem incluído no ZIP.

## Ensaio de restauração isolada

Use um Postgres descartável, nunca a homologação:

```bash
psql "$TEMP_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BACKUP_DIR/roles.sql"
psql "$TEMP_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BACKUP_DIR/schema.sql"
psql "$TEMP_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BACKUP_DIR/data.sql"
```

Depois compare contagens de tabelas, policies, funções, triggers e linhas críticas.

## Auth e Storage

- O dump padrão do CLI não inclui os schemas gerenciados `auth` e `storage`.
- Backups do projeto Supabase cobrem o banco, mas os arquivos físicos do Storage precisam de cópia separada.
- Nesta instalação há zero arquivos no Storage, portanto não existe blob a transferir nesta fase.
- Usuários Auth devem ser tratados pelo backup gerenciado do projeto ou por procedimento oficial específico; nunca exportar hashes ou tokens para o ZIP.
