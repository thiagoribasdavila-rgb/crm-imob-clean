# Fase 98 — Segurança, desempenho e observabilidade final

O gate reúne banco, memória, filas, idade da fila, dead letters, latência p95 da IA, restauração, HTTPS, cron e logs. Falhas críticas ou altas bloqueiam o avanço; snapshots preservam a evidência sem logs brutos, PII ou segredos.

Índices específicos aceleram consultas operacionais de outbox, DLQ e consumo de IA. O gate apenas autoriza seguir para homologação; nunca publica.

## Homologação

1. aplicar a migration e medir índices no banco real;
2. simular fila antiga, falha, DLQ e latência alta;
3. comprovar backup restaurado, HTTPS, cron e logs PM2;
4. registrar snapshots bloqueado e pronto;
5. verificar isolamento entre tenants e acesso exclusivo da diretoria;
6. executar carga controlada e observar memória/latência;
7. confirmar que o gate não publicou o sistema.
