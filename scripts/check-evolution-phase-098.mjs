import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-097-write-readiness.json");
const phase = json("config/evolution-phase-098-live-development-write-adapter.json");
const program = json("config/evolution-program-3000.json");
const adapter = read("lib/atlas/core-v2/live-development-write-adapter.ts");
const route = read("app/api/v1/core-v2/developments/write-preflight/route.ts");
const readiness = read("lib/atlas/core-v2/live-write-readiness.ts");
const index = read("lib/atlas/core-v2/index.ts");
const report = read("docs/EVOLUTION_PHASE_098_LIVE_DEVELOPMENT_WRITE_ADAPTER.md");

const statuses = ["ACTIVE", "PAUSED", "SOLD_OUT", "ARCHIVED"];
const forbiddenMutations = ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc('];

const checks = [
  ["Fase 97 foi preservada", previous.phase === 97 && previous.status === "completed"],
  ["Fase contínua 98 foi concluída sem mutar banco, Auth ou dados reais", phase.phase === 98 && phase.program === "continuous" && phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false && phase.authenticationChanged === false],
  ["Programa contínuo avançou para 98", program.currentPhase >= 98],
  ["Adaptador usa somente o contrato vivo crm_projects", adapter.includes('from("crm_projects")') && adapter.includes("LIVE_DEVELOPMENT_WRITABLE_FIELDS") && !adapter.includes('from("developments")')],
  ["Status reflete a constraint viva", statuses.every((status) => adapter.includes(`\"${status}\"`))],
  ["Tenant e alvo são validados explicitamente", adapter.includes('.eq("organization_id", plan.organizationId)') && adapter.includes('.eq("id", plan.projectId)')],
  ["Nome e código são verificados contra duplicidade", adapter.includes('findDuplicate(client, plan.organizationId, "name"') && adapter.includes('findDuplicate(client, plan.organizationId, "code"')],
  ["Payload não controla identidade nem tenant", adapter.includes("unsupported-field") && !adapter.includes('patch.organization_id') && !adapter.includes('patch.id')],
  ["Contrato mede incompatibilidade real de papéis", adapter.includes("LIVE_DEVELOPMENT_DATABASE_MANAGER_ROLES") && adapter.includes('"GESTOR"') && adapter.includes('"INCORPORADORA"') && adapter.includes("live-rls-role-contract-mismatch")],
  ["Ativação exige evento persistente e homologação", adapter.includes("persistent-project-audit-not-live") && adapter.includes("phase-99-controlled-homologation-pending") && adapter.includes("readyForWriteActivation: false")],
  ["Adaptador e rota não executam mutações", forbiddenMutations.every((token) => !adapter.includes(token) && !route.includes(token)) && adapter.includes("mutationExecuted: false") && route.includes("mutationExecuted")],
  ["Rota exige contexto, diretoria, rate limit e limite de payload", route.includes("requireAccessContext") && route.includes("canReviewLiveDevelopmentWrite") && route.includes("enforceRateLimit") && route.includes("MAX_BODY_BYTES")],
  ["Rota preserva RLS e não ganha chave administrativa", route.includes("access.supabase") && !route.includes("getSupabaseAdmin") && !adapter.includes("getSupabaseAdmin") && !route.includes("SERVICE_ROLE")],
  ["Rota registra somente metadados operacionais", route.includes("structuredApiLog") && route.includes("issueCodes") && !route.includes("result.patch") && !route.includes("error.message")],
  ["Prontidão V2 mantém Projetos bloqueado e expõe preflight", readiness.includes('live-write-readiness-v2') && readiness.includes('state: "blocked"') && readiness.includes('"preflight-create"') && readiness.includes('"preflight-update"')],
  ["Core V2 exporta o adaptador", index.includes('export * from "./live-development-write-adapter"')],
  ["Relatório cobre problema, impacto, riscos e validação", report.includes("Problema resolvido") && report.includes("Impacto operacional") && report.includes("Riscos identificados") && report.includes("Checklist de validação")],
  ["Build e ZIP continuam reservados à Fase 100", phase.release.buildExecuted === false && phase.release.zipCreated === false && phase.release.checkpointPhase === 100],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 098 verificada: Projetos possui pré-validação tenant-safe e nenhuma mutação foi liberada antes da homologação.");
