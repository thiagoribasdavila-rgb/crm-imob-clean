# Template — decisão humana final de homologação

Este template é um contrato de decisão. Ele não executa migration, não acessa o
projeto Supabase, não cria build, não cria ZIP e não publica na Hostinger.

## Pré-condições

Só preencha este documento depois que:

1. o ensaio local descartável da Fase 22 tiver sido realmente executado;
2. o recibo sanitizado da Fase 22 estiver válido;
3. a revisão humana da Fase 23 estiver válida e dentro da janela de 30 minutos;
4. a Fase 23 estiver em `84/84`;
5. o dossiê sanitizado produzido pela Fase 23 tiver sido salvo exatamente em:
   `artifacts/runtime/phase-023/manual/sanitized-homologation-dossier.json`;
6. o SHA-256 for calculado sobre os bytes exatos desse arquivo.

Não copie SQL, saída bruta do terminal, credenciais, dados de clientes, dados de
usuários Auth, objetos de Storage ou strings de conexão para estes documentos.

## Arquivo final

Salvar a decisão preenchida em:

`artifacts/runtime/phase-024/manual/final-homologation-decision.json`

```json
{
  "schema_version": "atlas.final_homologation_decision.v1",
  "status": "approved_for_controlled_homologation_change_planning",
  "scope": "phase_023_sanitized_dossier_only",
  "one_shot": true,
  "consumed": false,
  "issued_at": "AAAA-MM-DDTHH:MM:SS.000Z",
  "expires_at": "AAAA-MM-DDTHH:MM:SS.000Z",
  "decided_by": "IDENTIFICADOR-DO-RESPONSAVEL",
  "change_ticket": "ATLAS-CHANGE-ID",
  "sanitized_dossier_sha256": "SHA256-DE-64-CARACTERES",
  "target_environment": {
    "hosting_provider": "hostinger",
    "database_provider": "supabase",
    "target": "homologation",
    "postgres_major": 17,
    "pg14_not_used": true,
    "deprecated_extensions_reviewed": true,
    "breaking_changes_reviewed": true,
    "backup_plan_documented": true,
    "restore_rehearsal_documented": true,
    "maintenance_window_documented": true,
    "rollback_owner_present": true,
    "data_api_grants_and_rls_reviewed": true,
    "view_and_function_boundaries_reviewed": true,
    "service_secret_boundary_reviewed": true
  },
  "checks": {
    "dossier_hash_chain_reviewed": true,
    "receipt_and_review_current": true,
    "pgtap_verified": true,
    "lint_verified": true,
    "rollback_verified": true,
    "cleanup_verified": true,
    "privacy_verified": true,
    "pg14_not_used": true,
    "deprecated_extensions_reviewed": true,
    "breaking_changes_reviewed": true,
    "data_api_grants_and_rls_reviewed": true,
    "security_invoker_reviewed": true,
    "function_execution_boundary_reviewed": true,
    "service_secret_boundary_reviewed": true,
    "no_real_data_read_confirmed": true,
    "separate_change_plan_required": true
  },
  "decision": "prepare_separate_controlled_change_plan_only",
  "authorizations": {
    "homologation_status_recording": true,
    "controlled_change_plan_preparation": true,
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
    "release_package": false,
    "deploy": false,
    "hostinger_mutation": false,
    "meta_campaign_mutation": false,
    "whatsapp_send": false
  }
}
```

## Regras de validade

- A janela entre `issued_at` e `expires_at` deve ser de no máximo 30 minutos.
- A decisão é de uso único e deve permanecer com `consumed: false` até a
  verificação.
- O PostgreSQL deve ser confirmado no ambiente real. O contrato aceita apenas
  versões 15 ou 17 e rejeita PostgreSQL 14.
- Todos os checks devem ser verdadeiros com evidência verificável.
- O arquivo autoriza somente registrar o status e preparar outro plano.
- Qualquer tentativa de habilitar aplicação remota, produção, build, ZIP,
  deploy, Hostinger, Meta ou WhatsApp invalida a decisão inteira.

## Resultado permitido

Quando todos os 67 gates passarem, o único resultado permitido é:

`eligible_for_separate_controlled_change_plan`

Isso não significa “pronto para publicar”. Uma nova autorização específica,
separada e de curta validade ainda será obrigatória antes de qualquer execução.
