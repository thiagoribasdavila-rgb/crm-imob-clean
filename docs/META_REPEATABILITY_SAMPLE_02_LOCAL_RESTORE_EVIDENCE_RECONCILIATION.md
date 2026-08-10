# ATLAS AI OS — Fase 37/100

## Objetivo

Conciliar e homologar, somente no escopo local, a evidência sanitizada produzida por um restore lógico real e aprovado na Fase 36.

Esta entrega prepara o validador e o reconciliador. Nenhuma evidência real foi recebida e nenhuma conciliação foi executada.

## O que é conferido

- fingerprints do contrato, manifesto, conteúdo do backup e evidência;
- correspondência exata entre expectativas do manifesto e métricas restauradas;
- catálogo, contagens, RLS, constraints, Auth, metadados de Storage e migrations;
- PostgreSQL 17 e runtime sem rede ou portas publicadas;
- sequência temporal completa do ensaio;
- conclusão do restore e destruição do volume efêmero;
- ausência de segredos, conexões, registros de clientes ou outras linhas de dados.

Uma divergência rejeita toda a evidência. Não existe aprovação parcial ou correção automática de contagens.

## Limite da homologação

Um resultado aprovado significa apenas `reconciled_local_restore_only`.

Ele não autoriza:

- acesso a staging ou produção;
- `supabase db push` ou reset de projeto vinculado;
- execução de Docker ou banco durante a conciliação;
- envio de eventos reais ou de teste para Meta;
- alteração de campanhas;
- deploy ou build.

## Uso futuro com evidência real

Variáveis exigidas pelo reconciliador:

- `ATLAS_PHASE36_RESTORE_EVIDENCE_FILE`
- `ATLAS_PHASE35_REHEARSAL_CONTRACT_FILE`
- `ATLAS_PHASE35_BACKUP_MANIFEST_FILE`
- `ATLAS_PHASE37_RECONCILIATION_FILE` — opcional

Todos os arquivos devem permanecer no workspace. A evidência do restore precisa estar com permissão `0600`. O recibo também é gravado como `0600`.

## Estado desta entrega

- reconciliador offline preparado: sim;
- contrato e autotestes negativos: preparados;
- evidência real da Fase 36: não recebida;
- conciliação executada: não;
- banco ou Docker tocado: não;
- staging, produção ou Meta tocados: não;
- build executado: não.

## Referências oficiais

- [Restoring a downloaded backup locally](https://supabase.com/docs/guides/local-development/restoring-downloaded-backup)
- [Database backups](https://supabase.com/docs/guides/platform/backups)
- [Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Breaking change: self-hosted Supabase PG15 para PG17](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)

Os backups de banco preservam metadados do Storage, mas não os objetos armazenados. Por isso a Fase 37 só homologa contagens de metadados e exige inventário separado dos arquivos.

## Próxima fase

A Fase 38 projetará somente um recibo real aprovado na matriz de readiness. Controles sem evidência continuarão bloqueados.
