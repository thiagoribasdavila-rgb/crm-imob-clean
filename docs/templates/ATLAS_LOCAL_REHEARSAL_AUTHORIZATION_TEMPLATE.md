# Template — autorização do ensaio local descartável

Este template possui dois artefatos manuais independentes. Preencher os
valores reais somente após revisão humana. Criar os arquivos não inicia Docker,
não executa migration e não autoriza acesso remoto.

## 1. Recibo da autoria concluída na Fase 21

Salvar em:
`artifacts/runtime/phase-021/manual/local-migration-authoring-receipt.json`

```json
{
  "schema_version": "atlas.local_migration_authoring_receipt.v1",
  "status": "single_local_migration_authored_and_reviewed",
  "source": {
    "phase_021_schema_version": "atlas.10x.phase-021.v1",
    "phase_021_status": "ready_for_single_local_cli_authoring",
    "phase_021_gates_passed": 55,
    "phase_021_gates_total": 55,
    "phase_021_authoring_manifest_sha256": "<SHA-256>",
    "baseline_manifest_sha256": "<SHA-256>"
  },
  "files": {
    "migration": {
      "path": "supabase/migrations/<AAAAMMDDHHMMSS>_atlas_security_remediation.sql",
      "sha256": "<SHA-256>"
    },
    "pgtap": {
      "path": "supabase/tests/atlas_security_remediation_test.sql",
      "sha256": "<SHA-256>"
    }
  },
  "tests": [
    "anonymous_select_denied",
    "anonymous_insert_denied",
    "anonymous_update_denied",
    "anonymous_delete_denied",
    "cross_tenant_select_denied",
    "cross_tenant_insert_denied",
    "cross_tenant_update_denied",
    "cross_tenant_delete_denied",
    "owned_row_select_allowed",
    "owned_row_insert_allowed",
    "owned_row_update_allowed",
    "owned_row_delete_allowed",
    "ownership_reassignment_denied",
    "granted_role_still_respects_rls",
    "data_api_requires_explicit_grant_and_rls",
    "view_respects_security_invoker",
    "public_function_execute_denied",
    "service_role_secret_absent_from_client"
  ],
  "rollback": {
    "strategy": "destroy_volume_rebuild_baseline_and_compare_sha256",
    "destructive_scope": "isolated_local_project_only",
    "schema_fingerprint_required": true,
    "migration_history_fingerprint_required": true,
    "baseline_rebuild_required": true,
    "cleanup_required": true,
    "data_loss_forbidden": true
  },
  "privacy": {
    "contains_credentials": false,
    "contains_personal_data": false,
    "contains_business_data": false,
    "contains_auth_user_data": false,
    "contains_storage_objects": false,
    "contains_raw_sql": false,
    "contains_raw_cli_output": false
  },
  "authorizations": {
    "remote_read": false,
    "remote_write": false,
    "linked_project": false,
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

O recibo contém somente nomes, hashes e decisões. Não colar SQL, credenciais,
linhas do CRM, usuários Auth nem saída bruta da CLI.

## 2. Autorização humana curta da Fase 22

Salvar em:
`artifacts/runtime/phase-022/manual/local-rehearsal-authorization.json`

```json
{
  "schema_version": "atlas.local_rehearsal_authorization.v1",
  "status": "approved_for_single_disposable_local_rehearsal",
  "scope": "phase_021_authored_files_only",
  "one_shot": true,
  "consumed": false,
  "issued_at": "<ISO-8601>",
  "expires_at": "<ISO-8601; no máximo 30 minutos>",
  "reviewed_by": "<identificador-do-revisor>",
  "change_ticket": "<ticket>",
  "authoring_receipt_sha256": "<SHA-256 do arquivo de recibo>",
  "project_id": "atlas-phase-022-rehearsal",
  "authorizations": {
    "local_docker_start": true,
    "local_migration_apply": true,
    "local_pgtap_execution": true,
    "local_lint_execution": true,
    "local_rollback_execution": true,
    "local_cleanup": true,
    "remote_read": false,
    "remote_write": false,
    "linked_project": false,
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

Depois da única execução autorizada, alterar o registro operacional para
`"consumed": true`. Uma autorização expirada ou consumida nunca deve ser
reutilizada.

## Limites absolutos

- o banco é descartável, local e usa somente fixtures sintéticas;
- `supabase/config.toml` precisa existir e ser revisado; não é criado
  automaticamente pelo gate;
- `--linked`, `--db-url`, `db push` e `migration repair` são proibidos;
- a limpeza usa o `project-id` isolado; `supabase stop --all` é proibido;
- nenhuma migration é aplicada em projeto remoto ou produção;
- nenhum build ou ZIP é criado nesta fase.

O rollback aprovado destrói somente o volume isolado, reconstrói o baseline sem
a nova migration e compara os fingerprints SHA-256 de schema e histórico.
