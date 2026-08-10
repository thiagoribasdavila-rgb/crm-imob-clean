# ATLAS AI OS — Fase 38/100

## Objetivo

Projetar um recibo real e aprovado da Fase 37 sobre a matriz de readiness da Fase 34, sem confundir candidato de controle com autorização operacional.

Esta entrega prepara o validador e o projetor offline. Nenhuma evidência real foi recebida e nenhuma projeção foi executada.

## Cadeia exigida

O projetor exige três arquivos reais, sanitizados e com permissão `0600`:

1. recibo de readiness da Fase 34;
2. contrato de restore da Fase 35;
3. recibo de conciliação local da Fase 37.

O fingerprint da Fase 34 deve corresponder exatamente ao registrado no contrato da Fase 35. O fingerprint do contrato deve corresponder exatamente ao registrado no recibo da Fase 37. Qualquer divergência bloqueia toda a projeção.

## Promoções permitidas

Somente três controles podem ser promovidos quando toda a cadeia estiver comprovada:

- `immutable_backup_verified`;
- `restore_drill_verified`;
- `data_integrity_verified`.

O controle `security_equivalence` aparece no recibo da Fase 37 apenas como confirmação. Ele já estava comprovado na matriz da Fase 34 e não pode ser contado novamente como promoção.

Com fontes reais aprovadas, a cobertura projetada passa de 5 de 15 para **8 de 15 controles (53%)**.

## Controles que continuam bloqueados

- `isolated_staging_replay_verified`;
- `performance_baseline_verified`;
- `observability_ready`;
- `security_advisor_verified`;
- `performance_advisor_verified`;
- `production_rollback_runbook_verified`;
- `human_change_approval_verified`.

Portanto, nem mesmo uma projeção aprovada autoriza staging, produção, Meta, deploy ou build.

## Uso futuro com evidência real

Variáveis exigidas:

- `ATLAS_PHASE34_READINESS_FILE`;
- `ATLAS_PHASE35_REHEARSAL_CONTRACT_FILE`;
- `ATLAS_PHASE37_RECONCILIATION_FILE`;
- `ATLAS_PHASE38_READINESS_PROJECTION_FILE` — opcional.

O projetor somente lê JSON local, rejeita links simbólicos, arquivos fora do workspace, permissões abertas, segredos e linhas de dados. O recibo é gravado com permissão `0600`.

## Estado desta entrega

- projetor offline preparado: sim;
- cadeia de fingerprints e allowlist exata: preparadas;
- evidências reais das Fases 34, 35 e 37: não recebidas;
- projeção foi executada: não;
- cobertura real atual atribuída por esta fase: 0%;
- banco, Docker, staging, produção ou Meta tocados: não;
- build executado: não.

## Referências oficiais

- [Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Database backups](https://supabase.com/docs/guides/platform/backups)
- [Restoring a downloaded backup locally](https://supabase.com/docs/guides/local-development/restoring-downloaded-backup)
- [Breaking change: self-hosted Supabase PG15 para PG17](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)

O ambiente local do Supabase é somente de desenvolvimento e não equivale a staging ou produção. Além disso, backups do banco não incluem os objetos físicos do Storage, apenas seus metadados; por isso nenhum desses itens é inferido nesta fase.

## Próxima fase

A Fase 39 preparará o contrato de replay em staging isolado, sem executá-lo e somente depois de existir uma projeção real 8/15, ambiente descartável, rollback revisado e aprovação humana explícita.
