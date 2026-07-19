# Fase 80 — Gate final de modelo e equidade

## Resultado

A calibração só influencia a operação depois de passar por dataset validado, amostra, drift aceitável, explicabilidade observada, auditoria de segmentos operacionais e aprovação da diretoria.

## Equidade e segurança

- Auditoria usa somente faixas de qualidade cadastral, com 50 exemplos por segmento.
- Atributos protegidos e documentos são proibidos nas features e verificados antes da liberação.
- Sem aprovação, a probabilidade retorna ao baseline.
- Aprovação, rejeição e rollback exigem justificativa e ficam auditáveis.
- Nunca há liberação ou rollback automático.

## Homologação

Aplicar migrations 75–80, executar `npm run model-release-gate:check`, testar gates bloqueado/pronto, aprovação, substituição e rollback. Validar atributos proibidos, amostras, diretoria, superintendência e dois tenants.
