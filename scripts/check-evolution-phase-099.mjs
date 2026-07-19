import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-098-live-development-write-adapter.json");
const phase = json("config/evolution-phase-099-project-write-homologation.json");
const program = json("config/evolution-program-3000.json");
const migration = read("supabase/migrations/20260719042811_project_write_audit_gate.sql");
const homologation = read("lib/atlas/core-v2/live-development-write-homologation.ts");
const readiness = read("lib/atlas/core-v2/live-write-readiness.ts");
const index = read("lib/atlas/core-v2/index.ts");
const report = read("docs/EVOLUTION_PHASE_099_PROJECT_WRITE_HOMOLOGATION.md");

const canonicalRoles = ["ADMIN", "DIRETOR_DECISOR", "DIRETOR", "GERENTE"];
const requiredBlockers = [
  "project-write-gate-migration-not-applied",
  "project-audit-table-not-live",
  "project-role-helper-not-live",
  "project-write-rpc-not-live",
  "project-role-matrix-not-tested",
  "project-create-rollback-not-tested",
  "project-update-rollback-not-tested",
  "project-cross-tenant-isolation-not-tested",
  "project-idempotency-not-tested",
  "project-write-signoff-not-recorded",
];

const checks = [
  ["Fase 98 foi preservada", previous.phase === 98 && previous.status === "completed"],
  ["Fase contínua 99 concluiu somente o desenho local", phase.phase === 99 && phase.program === "continuous" && phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false && phase.authenticationChanged === false && phase.migrationDraftCreated === true && phase.migrationApplied === false],
  ["Programa contínuo avançou para 99", program.currentPhase >= 99],
  ["Função comercial compartilhada permanece intocada", !migration.includes("create or replace function private.can_manage_commercial_data") && phase.safety.sharedCommercialFunctionChanged === false],
  ["Gate específico usa tenant, perfil ativo e papéis canônicos", migration.includes("function private.can_manage_projects") && migration.includes("set search_path = ''") && migration.includes("profile.organization_id = target_organization_id") && migration.includes("profile.active is true") && canonicalRoles.every((role) => migration.includes(`'${role}'`))],
  ["Privilégios do helper são explícitos", migration.includes("revoke all on function private.can_manage_projects(uuid) from public") && migration.includes("revoke all on function private.can_manage_projects(uuid) from anon") && migration.includes("grant execute on function private.can_manage_projects(uuid) to authenticated")],
  ["Histórico persistente é tenant-safe e append-only", migration.includes("create table if not exists public.crm_project_events") && migration.includes("crm_project_events_project_tenant_fk") && migration.includes("references public.crm_projects(id, organization_id)") && migration.includes("before_state jsonb") && migration.includes("after_state jsonb not null") && migration.includes("crm_project_events_idempotency_unique")],
  ["Índices cobrem FKs e timeline", migration.includes("crm_project_events_project_tenant_fk_idx") && migration.includes("crm_project_events_timeline_idx") && migration.includes("crm_project_events_actor_idx")],
  ["RLS do evento é forçada e leitura é explícita", migration.includes("force row level security") && migration.includes("create policy crm_project_events_select_managers") && migration.includes("grant select on table public.crm_project_events to authenticated") && migration.includes("revoke all on table public.crm_project_events from authenticated")],
  ["DML direto e exclusão continuam bloqueados", migration.includes("revoke insert, update, delete, truncate, references, trigger") && migration.includes("Initial rollout deliberately has no DELETE policy") && !/create policy[\s\S]{0,120}for delete/i.test(migration)],
  ["Comando de projeto aceita somente criação e atualização", migration.includes("function public.mutate_crm_project_v1") && migration.includes("v_operation not in ('create', 'update')") && migration.includes("unsupported-project-operation") && !migration.includes("v_operation = 'delete'")],
  ["Comando valida autenticação, tenant e papel", migration.includes("authentication-required") && migration.includes("p_organization_id <> private.current_organization_id()") && migration.includes("not private.can_manage_projects(p_organization_id)")],
  ["Comando é atômico, auditado e idempotente", migration.includes("project-idempotency-key-conflict") && migration.includes("request_fingerprint") && migration.includes("insert into public.crm_project_events") && migration.includes("'replayed', true") && migration.includes("'replayed', false")],
  ["Execução da RPC é explicitamente restrita", migration.includes("revoke all on function public.mutate_crm_project_v1") && migration.includes("from public") && migration.includes("from anon") && migration.includes("to authenticated")],
  ["Contrato local mantém ativação negada sem evidência", homologation.includes("design-approved-awaiting-controlled-application") && homologation.includes("activationAllowed") && homologation.includes("directDmlAllowed: false") && homologation.includes("deleteAllowed: false") && homologation.includes("EMPTY_LIVE_DEVELOPMENT_WRITE_EVIDENCE")],
  ["Matriz cobre papéis, tenant, idempotência e rollback", canonicalRoles.every((role) => homologation.includes(`\"${role}\"`)) && homologation.includes('actor: "CORRETOR"') && homologation.includes('tenant: "different"') && homologation.includes("same-idempotency-key-same-request") && homologation.includes("audit-insert-fails-after-project-command")],
  ["Todos os bloqueios exigidos aparecem no gate", requiredBlockers.every((blocker) => homologation.includes(blocker))],
  ["Prontidão V3 permanece bloqueada e usa as evidências", readiness.includes("live-write-readiness-v3") && readiness.includes("getLiveDevelopmentWriteHomologation") && readiness.includes('state: "blocked"') && readiness.includes("developmentHomologation.missingEvidence")],
  ["Core V2 exporta o contrato de homologação", index.includes('export * from "./live-development-write-homologation"')],
  ["Relatório cobre problema, impacto, riscos, rollback e validação", report.includes("Problema resolvido") && report.includes("Impacto operacional") && report.includes("Riscos identificados") && report.includes("Plano de rollback") && report.includes("Checklist de validação")],
  ["Build e ZIP continuam reservados à Fase 100", phase.release.buildExecuted === false && phase.release.zipCreated === false && phase.release.checkpointPhase === 100],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 099 verificada: a escrita de Projetos tem desenho atômico e auditável, mas segue bloqueada até homologação real.");
