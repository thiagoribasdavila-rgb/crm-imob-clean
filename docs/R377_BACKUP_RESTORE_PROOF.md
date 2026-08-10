# R377 — Prova de backup e restauração

Data: 10/08/2026

## Artefatos privados verificados

Os dumps permanecem fora do Git e do pacote de distribuição em `.private-backups/20260810-r377/`.

| Artefato | Bytes | SHA-256 |
|---|---:|---|
| `public-schema.sql` | 974156 | `3639f54be69dac3f823bced05e194ae24987cb5dc4a371b4804f97f286a31608` |
| `public-data.sql` | 8745686 | `8cef83c1eedd9003349697ccf986b34d8c953cbb07a6eb20df21783f90cd7554` |
| `private-schema.sql` | 43249 | `b49b89f10756e8dbce62d98274c8ec1552ace3aa923e53e8f29350a0296e0881` |
| `application-schema.sql` | 1017062 | `b23ff79068bcd46fe4a004f41aada3126c2388b193a662ddc65a1fcb726066ff` |

## Prova executada

1. Um laboratório Supabase descartável foi criado em `/tmp`.
2. O dump combinado `application-schema.sql` foi restaurado respeitando dependências cruzadas entre `public` e `private`.
3. A migration de reconciliação R377 foi aplicada.
4. O lint dos schemas `public,private` retornou zero erro.
5. Os dados públicos foram restaurados em uma única sessão, com triggers suspensos somente durante a carga e reativados ao final.
6. Contagens de organizações, perfis, leads, projetos, tarefas e campanhas foram conferidas.
7. O laboratório foi destruído sem tocar homologação.

## Comandos operacionais

Use variáveis locais; nunca substitua os marcadores abaixo dentro de arquivos versionados.

```bash
export DATABASE_URL='<URL_PRIVADA_DO_BANCO>'
pg_dump "$DATABASE_URL" --schema=public --schema=private --schema-only > application-schema.sql
pg_dump "$DATABASE_URL" --schema=public --data-only > public-data.sql
sha256sum application-schema.sql public-data.sql
```

Restauração somente em banco temporário e vazio:

```bash
export RESTORE_DATABASE_URL='<URL_PRIVADA_DO_BANCO_TEMPORARIO>'
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f application-schema.sql
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
set session_replication_role = replica;
\i public-data.sql
set session_replication_role = origin;
SQL
```

## Limites da prova

- Auth gerenciado, objetos do Storage e configurações da plataforma exigem também backup/restauração nativos do Supabase; um dump SQL da aplicação não substitui essa camada.
- Os dumps contêm dados privados e nunca devem entrar no repositório, no ZIP ou em logs compartilhados.
- A restauração nunca deve ser ensaiada sobre a homologação ativa.
