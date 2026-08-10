import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const leadFunction = read("supabase/migrations/20260717102500_atomic_lead_registration.sql");
const projectFunction = read("supabase/migrations/20260719042811_project_write_audit_gate.sql");
const accessMatrix = read("supabase/tests/database/phase_007_rls_access_matrix.test.sql");
const isolationTest = read("supabase/tests/database/phase_008_dynamic_rls_isolation.test.sql");
const leadRoute = read("app/api/v1/leads/route.ts");
const report = read("docs/EVOLUTION_PHASE_356_PRIVILEGED_FUNCTION_ACCESS_REVIEW.md");

const checks = [
  [
    "Rota ativa grava na tabela canônica sem chamar a RPC legada",
    leadRoute.includes('.from("leads")') && !leadRoute.includes('rpc("create_lead_atomic"'),
  ],
  [
    "RPC de lead valida identidade, tenant e responsável",
    leadFunction.includes("auth.uid() is null") &&
      leadFunction.includes("p_organization_id <> public.current_organization_id()") &&
      leadFunction.includes("p_assigned_to <> auth.uid()"),
  ],
  [
    "RPC de lead preserva deduplicação e supressão de contato",
    leadFunction.includes("pg_advisory_xact_lock") &&
      leadFunction.includes("public.contact_quality_suppressions") &&
      leadFunction.includes("public.leads"),
  ],
  [
    "RPC de projeto usa search_path vazio e autenticação explícita",
    projectFunction.includes("create or replace function public.mutate_crm_project_v1") &&
      projectFunction.includes("set search_path = ''") &&
      projectFunction.includes("v_actor_id uuid := auth.uid()") &&
      projectFunction.includes("message = 'authentication-required'"),
  ],
  [
    "RPC de projeto valida tenant, papel, operação e idempotência",
    projectFunction.includes(
      "p_organization_id <> (select public.current_organization_id())",
    ) &&
      projectFunction.includes("not private.can_manage_projects(p_organization_id)") &&
      projectFunction.includes("v_operation not in ('create', 'update')") &&
      projectFunction.includes("project-idempotency-key-invalid"),
  ],
  [
    "Matriz exige os quatro contratos autenticados deliberados",
    accessMatrix.includes("authenticated mantém o RPC atômico governado") &&
      accessMatrix.includes("authenticated mantém helpers exigidos pelas policies existentes") &&
      accessMatrix.includes("authenticated mantém mutação de projeto governada"),
  ],
  [
    "Ensaio dinâmico contém negativas contra owner e tenant forjados",
    isolationTest.includes("RPC de lead rejeita owner diferente de auth.uid") &&
      isolationTest.includes("RPC de projeto rejeita organização diferente da identidade atual") &&
      isolationTest.includes("phase_008_isolated_clone_required"),
  ],
  [
    "Relatório registra consumidores RLS e não declara falsamente os avisos resolvidos",
    report.includes("186 policies RLS") &&
      report.includes("3 policies RLS") &&
      report.includes("não marcou os avisos do advisor como resolvidos"),
  ],
  [
    "Relatório preserva release gate e exige prova em clone isolado",
    report.includes("clone isolado") &&
      report.includes("não libera build, ZIP ou deploy") &&
      report.includes("fase **349**"),
  ],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);

console.log(
  `Fase 356 verificada: ${checks.length}/${checks.length} contratos aprovados sem alteração no banco.`,
);
