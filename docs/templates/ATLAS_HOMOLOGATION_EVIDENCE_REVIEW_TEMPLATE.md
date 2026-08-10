# Template — evidência sanitizada e revisão da homologação

Este template possui dois artefatos manuais. Ele não executa comandos e não
autoriza banco local, Docker, projeto linked, aplicação remota, produção,
build ou ZIP.

## 1. Recibo sanitizado do ensaio local concluído

Salvar em:
`artifacts/runtime/phase-022/manual/local-rehearsal-execution-receipt.json`

Preencher somente depois que o ensaio local isolado da Fase 22 tiver sido
realmente executado, concluído e limpo.

```json
{
  "schema_version": "atlas.local_rehearsal_execution_receipt.v1",
  "status": "single_disposable_local_rehearsal_completed",
  "source": {
    "phase_022_schema_version": "atlas.10x.phase-022.v1",
    "phase_022_status": "ready_for_single_disposable_local_rehearsal",
    "phase_022_gates_passed": 83,
    "phase_022_gates_total": 83,
    "phase_022_plan_sha256": "<SHA-256>",
    "authoring_receipt_sha256": "<SHA-256>",
    "rehearsal_authorization_sha256": "<SHA-256>",
    "migration_sha256": "<SHA-256>",
    "pgtap_sha256": "<SHA-256>",
    "baseline_manifest_sha256": "<SHA-256>"
  },
  "environment": {
    "cli_version": "2.109.1",
    "project_id": "atlas-phase-022-rehearsal",
    "workdir": ".atlas/runtime/phase-022/rehearsal",
    "source_config_sha256": "<SHA-256>",
    "external_traffic_allowed": false,
    "synthetic_fixtures_only": true,
    "seed_executed": false
  },
  "execution": {
    "started_at": "<ISO-8601>",
    "completed_at": "<ISO-8601>",
    "authorization_consumed": true,
    "db_start_passed": true,
    "baseline_reset_passed": true,
    "migration_up_passed": true,
    "pgtap_passed": true,
    "db_lint_passed": true,
    "pre_cleanup_tests_passed": true,
    "volume_destroyed": true,
    "baseline_rebuild_passed": true,
    "post_restore_tests_passed": true,
    "final_cleanup_passed": true
  },
  "test_results": {
    "file": "supabase/tests/atlas_security_remediation_test.sql",
    "total": 18,
    "passed": 18,
    "failed": 0,
    "skipped": 0,
    "catalog_sha256": "<SHA-256 do catálogo ordenado da Fase 23>"
  },
  "lint_results": {
    "level": "error",
    "fail_on": "error",
    "errors": 0,
    "warnings": 0
  },
  "fingerprints": {
    "schema_before_sha256": "<SHA-256>",
    "schema_after_sha256": "<SHA-256 diferente do anterior>",
    "schema_restored_sha256": "<igual a schema_before_sha256>",
    "migration_history_before_sha256": "<SHA-256>",
    "migration_history_after_sha256": "<SHA-256 diferente do anterior>",
    "migration_history_restored_sha256": "<igual a migration_history_before_sha256>"
  },
  "cleanup": {
    "project_id": "atlas-phase-022-rehearsal",
    "used_all_flag": false,
    "used_no_backup": true,
    "volumes_removed": true,
    "workdir_removed": true,
    "residual_containers": 0,
    "residual_volumes": 0
  },
  "privacy": {
    "contains_credentials": false,
    "contains_personal_data": false,
    "contains_business_data": false,
    "contains_auth_user_data": false,
    "contains_storage_objects": false,
    "contains_raw_sql": false,
    "contains_raw_cli_output": false,
    "contains_connection_strings": false
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

Não anexar SQL, saída da CLI, connection string, JWT, chave, telefone, e-mail,
nome de cliente, linha de negócio, usuário Auth ou objeto Storage. O recibo
carrega somente estado, contagens, booleanos, timestamps e hashes.

## 2. Revisão humana curta da evidência

Calcular primeiro o SHA-256 exato do recibo acima. Salvar a revisão em:
`artifacts/runtime/phase-023/manual/homologation-evidence-review.json`

```json
{
  "schema_version": "atlas.homologation_evidence_review.v1",
  "status": "approved_for_homologation_dossier_generation",
  "scope": "phase_022_sanitized_execution_receipt_only",
  "one_shot": true,
  "consumed": false,
  "issued_at": "<ISO-8601>",
  "expires_at": "<ISO-8601; no máximo 30 minutos>",
  "reviewed_by": "<identificador-do-revisor>",
  "change_ticket": "<ticket>",
  "execution_receipt_sha256": "<SHA-256 do recibo>",
  "checks": {
    "receipt_shape_reviewed": true,
    "hash_chain_reviewed": true,
    "pgtap_reviewed": true,
    "lint_reviewed": true,
    "rollback_reviewed": true,
    "cleanup_reviewed": true,
    "privacy_reviewed": true,
    "data_api_grants_and_rls_reviewed": true,
    "view_and_function_boundaries_reviewed": true,
    "service_secret_boundary_reviewed": true
  },
  "decision": "prepare_human_homologation_decision_only",
  "authorizations": {
    "dossier_generation": true,
    "homologation_decision_preparation": true,
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

A revisão vale uma vez e por até 30 minutos. Ela autoriza somente a geração em
memória do dossiê e a preparação da decisão humana da Fase 24.

## Limites absolutos

- o dossiê não é uma autorização de deploy;
- `dossier_generation: true` não permite ler ou escrever em Supabase remoto;
- grants da Data API e RLS precisam estar aprovados juntos;
- views e funções precisam ter fronteiras de privilégio comprovadas;
- o segredo de serviço nunca pode aparecer no cliente;
- projeto linked, produção, build e pacote permanecem bloqueados.
