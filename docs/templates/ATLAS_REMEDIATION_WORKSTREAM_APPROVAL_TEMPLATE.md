# Template — aprovação de workstreams da Fase 20

Use este documento somente depois que o plano sanitizado da Fase 19 estiver
válido. A aprovação não autoriza SQL, criação de migration ou acesso remoto.

## Regras de preenchimento

- copie o hash SHA-256 do plano reconstruído;
- aprove ao menos um workstream ativo;
- classifique todos os demais workstreams ativos como adiados;
- não inclua nomes de tabelas, views, funções, policies ou colunas;
- não inclua SQL, saída de CLI, credenciais ou dados reais;
- use identificadores curtos no revisor e no ticket;
- mantenha a validade em no máximo 60 minutos.

```json
{
  "schema_version": "atlas.remediation_workstream_approval.v1",
  "status": "approved_for_local_specification_only",
  "scope": "sanitized_active_workstreams_only",
  "one_shot": true,
  "consumed": false,
  "issued_at": "AAAA-MM-DDTHH:MM:SS.000Z",
  "expires_at": "AAAA-MM-DDTHH:MM:SS.000Z",
  "reviewed_by": "revisor_identificado",
  "change_ticket": "ticket_identificado",
  "plan_sha256": "SHA256_DO_PLANO_RECONSTRUIDO",
  "approved_workstream_ids": [
    "WS-RLS-001"
  ],
  "deferred_workstream_ids": [
    "WS-GRANT-002"
  ],
  "authorizations": {
    "local_specification": true,
    "sql_authoring": false,
    "migration_generation": false,
    "remote_read": false,
    "remote_write": false,
    "migration_apply": false,
    "db_push": false,
    "migration_repair": false,
    "branch_mutation": false,
    "production": false,
    "business_rows_read": false,
    "auth_rows_read": false,
    "storage_objects_read": false,
    "build": false,
    "release_package": false
  }
}
```

## Declaração obrigatória

Revisão humana: obrigatória.

Nenhuma migration foi gerada ou aplicada. Nenhum acesso remoto foi autorizado.

