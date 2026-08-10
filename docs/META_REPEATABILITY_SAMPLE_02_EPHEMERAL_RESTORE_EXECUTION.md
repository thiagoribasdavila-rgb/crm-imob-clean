# ATLAS Meta/Andromeda — Fase 36/100

## Resultado

A Fase 36 prepara o executor de restauração real, mas exclusivamente em um PostgreSQL 17 local, efêmero, sem rede, sem portas publicadas e com destruição obrigatória do volume. O executor está pronto; o ensaio não foi executado porque o contrato real da Fase 35, o manifesto, o arquivo de backup e a aprovação humana ainda não foram recebidos.

O objetivo não é liberar staging ou produção. Mesmo um restore local aprovado mantém `stagingMigrationAllowed`, `productionMigrationAllowed` e `productionCompatibilityApproved` como `false`.

## Cadeia obrigatória

1. Recibo real e aprovado da Fase 34.
2. Manifesto real e verificado de backup da Fase 35.
3. Contrato real da Fase 35, vinculado aos dois documentos anteriores por SHA-256.
4. Arquivo lógico de backup dentro do workspace, regular, sem link simbólico.
5. Hash e tamanho do arquivo iguais aos declarados no manifesto.
6. Expectativas sanitizadas de integridade e segurança produzidas na origem.
7. Aprovação humana exata: `EXECUTE_PHASE36_LOCAL_EPHEMERAL_RESTORE_ONLY`.
8. Docker Compose disponível para o runtime local descartável.

Qualquer ausência ou divergência encerra o processo antes de tocar um banco.

## Isolamento

- Imagem fixada: `supabase/postgres:17.6.1.149`.
- `network_mode: none`.
- Nenhuma porta publicada.
- Nenhum projeto Supabase vinculado.
- Nenhuma URL de banco aceita.
- Nenhum `db push`, `db reset --linked`, deploy ou chamada HTTP.
- Volume dedicado, removido no bloco de limpeza mesmo quando o restore falha.
- Evidência final gravada com permissão `0600`.

O banco local do Supabase é próprio para desenvolvimento e inspeção, não para produção. A documentação oficial também recomenda tornar explícito se um comando atua em ambiente local ou vinculado.

## Proteção do backup lógico

Antes do runtime iniciar, o executor percorre o arquivo em streaming, calcula SHA-256 e bloqueia construções que poderiam acionar processo ou rede, incluindo:

- escape de shell do `psql`;
- `\setenv`;
- `COPY ... PROGRAM`;
- foreign server e user mapping;
- `dblink_connect`;
- chamadas HTTP de extensões;
- agendamentos via `cron.schedule`.

Backups físicos permanecem bloqueados nesta fase. Eles exigem um fluxo separado alinhado ao `supabase db start --from-backup` e à versão exata da imagem do backup.

## Restore e validação

O restore lógico usa transação única, `ON_ERROR_STOP` e desativação temporária de triggers no alvo isolado. Depois compara apenas métricas sanitizadas — nunca linhas ou dados pessoais:

- versão major do PostgreSQL;
- fingerprint SHA-256 do catálogo de colunas;
- número de schemas, tabelas e tabelas com RLS;
- zero tabelas públicas sem RLS;
- zero constraints não validadas;
- contagem de usuários em Auth;
- contagem de buckets e metadados de objetos do Storage;
- contagem do histórico de migrations;
- duração máxima do restore;
- destruição do volume.

O fingerprint do catálogo deve ser calculado na origem com a mesma ordenação usada pelo executor: schema, tabela, posição, coluna, tipo e nulabilidade, excluindo `information_schema` e schemas `pg_%`.

## Estado desta entrega

- Executor local: preparado.
- Compose sem rede: preparado.
- Autotestes negativos: preparados.
- Contrato real da Fase 35: não recebido.
- Backup lógico real: não recebido.
- Aprovação humana: não recebida.
- Restore: não executado.
- Banco local ou remoto: não tocado.
- Meta e campanhas: não tocados.
- Build: não executado.

## Execução futura controlada

Somente um operador autorizado poderá fornecer os quatro caminhos de evidência e a aprovação exata. O workflow atual valida apenas auditoria e preflight; ele não executa restore automaticamente.

## Referências oficiais verificadas em 19/07/2026

- [Restoring a downloaded backup locally](https://supabase.com/docs/guides/local-development/restoring-downloaded-backup)
- [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Local Development](https://supabase.com/docs/guides/local-development)
- [Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Breaking change: self-hosted Supabase PostgreSQL 15 → 17](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)

## Próxima fase

A Fase 37 conciliará a evidência sanitizada de um restore local aprovado. Sem essa evidência, continuará bloqueada e não alegará prontidão de staging ou produção.
