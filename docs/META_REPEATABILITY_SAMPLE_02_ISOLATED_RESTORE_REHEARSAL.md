# ATLAS AI OS — Fase 35/100

## Objetivo

Preparar o contrato verificável de um futuro ensaio de restauração da amostra 02 em ambiente isolado, efêmero e descartável. Esta fase valida somente evidências e planos; ela não restaura banco, não conecta ao Supabase e não acessa produção.

## Problema resolvido

Ter um backup não comprova que ele é recente, íntegro, restaurável ou suficiente para recuperar toda a operação. O contrato agora exige uma cadeia clara entre:

1. matriz real da Fase 34;
2. manifesto real do backup com hashes;
3. inventário do Storage e configurações complementares;
4. plano de restauração isolada;
5. validações pós-restauração;
6. destruição obrigatória do alvo;
7. aprovação humana antes de qualquer execução.

## Evidências obrigatórias do backup

O manifesto `phase35.backup-manifest.v1` deve comprovar:

- backup lógico ou download físico compatível com PostgreSQL 17;
- idade máxima de 24 horas e RPO de até 1.440 minutos;
- hash SHA-256 do conteúdo e hash da identidade de origem;
- imutabilidade, criptografia em repouso e cópia externa verificada;
- inventário separado dos objetos do Storage;
- documentação de papéis personalizados;
- documentação de alterações nos schemas `auth` e `storage`;
- documentação das publicações Realtime, subscriptions e slots de replicação;
- ausência de credenciais no manifesto.

## Plano de restauração

O futuro alvo precisa ser:

- isolado da produção;
- descartável;
- identificado explicitamente como não produtivo;
- incapaz de escrever no banco de origem;
- configurado para interromper em qualquer erro;
- validado por integridade, segurança e baseline de desempenho;
- destruído ao final, independentemente do resultado.

O contrato produzido nesta fase mantém `restoreExecuted`, `restoreExecutionAllowed`, `stagingMigrationAllowed` e `productionMigrationAllowed` sempre `false`.

## Por que o Storage é tratado separadamente

O backup do banco contém metadados do Storage, mas não os próprios objetos. Portanto, uma restauração de banco sem inventário e plano de recuperação dos arquivos seria incompleta e não pode ser considerada ensaio aprovado.

## Estado desta fase

- contrato estático: **preparado**;
- 44 cenários negativos e de isolamento: **preparados**;
- preparador somente leitura: **preparado**;
- validação estática no workflow manual: **preparada**;
- recibo real da Fase 34: **não recebido**;
- manifesto real de backup: **não recebido**;
- contrato real da Fase 35: **não emitido**;
- restauração: **não executada**;
- banco local, remoto ou produção: **não tocados**;
- Supabase remoto, Meta e campanhas: **não tocados**;
- build: **não executado**.

## Referências oficiais consultadas em 19/07/2026

- [Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [Restoring a downloaded backup locally](https://supabase.com/docs/guides/local-development/restoring-downloaded-backup)
- [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)

A documentação oficial informa que backups de banco não restauram os objetos do Storage e que senhas de papéis personalizados não fazem parte dos backups diários. Também recomenda separar staging e produção. O runtime local restaurado não é considerado pronto para produção.

## Próxima etapa recomendada

A Fase 36 poderá preparar e executar apenas um ensaio local, efêmero e destrutivo do alvo descartável. Isso continuará bloqueado até existirem recibos reais das Fases 34 e 35, manifesto real de backup, runtime compatível e aprovação humana explícita. Nenhuma credencial ou conexão será inferida automaticamente.
