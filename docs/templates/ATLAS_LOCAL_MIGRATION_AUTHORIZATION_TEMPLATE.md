# Template — autorização de autoria local da Fase 21

Use somente depois que a Fase 20 produzir uma especificação real aprovada. Esta
autorização permite preparar **uma única migration local** e seus testes pgTAP.
Ela não autoriza conexão a projeto linked, aplicação remota ou produção.

## Regras

- copie o SHA-256 da especificação real da Fase 20;
- copie o SHA-256 do manifesto dos arquivos de migration já existentes;
- identifique revisor e ticket;
- use validade máxima de 30 minutos;
- preserve todos os arquivos de migration existentes;
- não inclua credenciais, dados pessoais, dados comerciais ou saída bruta da CLI;
- mantenha o nome controlado `atlas_security_remediation`;
- após o primeiro uso, marque `consumed: true`.

```json
{
  "schema_version": "atlas.local_migration_authorization.v1",
  "status": "approved_for_single_local_migration_authoring",
  "scope": "phase_020_approved_workstreams_only",
  "one_shot": true,
  "consumed": false,
  "issued_at": "AAAA-MM-DDTHH:MM:SS.000Z",
  "expires_at": "AAAA-MM-DDTHH:MM:SS.000Z",
  "reviewed_by": "revisor_identificado",
  "change_ticket": "ticket_identificado",
  "specification_sha256": "SHA256_DA_ESPECIFICACAO_FASE_20",
  "baseline_manifest_sha256": "SHA256_DO_MANIFESTO_DE_MIGRATIONS",
  "migration_name": "atlas_security_remediation",
  "authorizations": {
    "local_sql_authoring": true,
    "local_migration_generation": true,
    "local_pgtap_authoring": true,
    "local_test_execution": true,
    "local_lint_execution": true,
    "remote_read": false,
    "remote_write": false,
    "linked_project": false,
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

Revisão humana: obrigatória. A autorização é de uso único e local.

Nenhuma migration foi aplicada. Nenhum projeto linked ou ambiente de produção
foi acessado.
