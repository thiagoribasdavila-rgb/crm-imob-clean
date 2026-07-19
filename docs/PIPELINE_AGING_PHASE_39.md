# Fase 39 — Aging do pipeline

## Resultado

O Atlas mede há quantos dias cada lead permanece na etapa atual, compara com o SLA canônico e classifica a carteira em saudável, atenção, estagnada ou crítica. A fila prioriza ação, mas nunca transfere leads ou avalia pessoas automaticamente.

## Fonte e precisão

`pipeline_stage_moves` fornece o horário real de entrada. Registros anteriores à Fase 33 usam `leads.created_at` como estimativa e aparecem na cobertura, sem falsa precisão. Movimentos dos últimos 30 dias são contados; velocidade só é declarada quando existe histórico.

## Segurança e homologação

A API usa sessão, organização, RLS e hierarquia. Validar criação, avanço, reversão, registros antigos, quatro perfis e dois tenants. Conferir manualmente idades próximas da virada do dia e executar `npm run pipeline-aging:check`.
