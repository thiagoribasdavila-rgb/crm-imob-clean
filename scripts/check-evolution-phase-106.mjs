import { readFileSync } from "node:fs";

const checks = [];

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

const program = JSON.parse(read("config/evolution-program-3000.json"));
const config = JSON.parse(read("config/evolution-phase-106-operational-module-audit.json"));
const docs = read("docs/EVOLUTION_PHASE_106_OPERATIONAL_MODULE_AUDIT.md");
const packageJson = JSON.parse(read("package.json"));
const pipelineApi = read("app/api/v1/pipeline/route.ts");
const liveRepositories = read("lib/atlas/core-v2/live-repositories.ts");
const legacyCompat = read("lib/compat/legacy-v2.ts");
const kanbanAlias = read("lib/atlas/navigation-aliases.ts");

assert("programa avançou para fase 106", program.currentPhase === 106);
assert("configuração da fase 106 existe", config.phase === 106 && config.status === "implemented");
assert("fase 106 pertence ao V4", config.roadmapVersion === "V4");
assert("script npm da fase 106 foi registrado", packageJson.scripts["evolution:phase-106:check"] === "node scripts/check-evolution-phase-106.mjs");
assert("auditoria aponta camada correta de pipeline", pipelineApi.includes("readCompatiblePipeline"));
assert("camada live lê leads compatíveis", liveRepositories.includes("readCompatibleLeads") && liveRepositories.includes("LIVE_LEAD_SELECT"));
assert("camada live lê tarefas por due_date", liveRepositories.includes("LIVE_TASK_SELECT") && liveRepositories.includes("due_date"));
assert("camada live lê projetos por crm_projects", liveRepositories.includes("crm_projects") && liveRepositories.includes("readCompatibleDevelopments"));
assert("compatibilidade transforma lead em oportunidade", legacyCompat.includes("leadAsOpportunity") && legacyCompat.includes("score_ia"));
assert("compatibilidade transforma due_date em due_at", legacyCompat.includes("due_at") && legacyCompat.includes("due_date"));
assert("kanban aponta para pipeline", kanbanAlias.includes('"/kanban"') && kanbanAlias.includes('"/pipeline"'));
assert("documentação registra causa raiz", docs.includes("causa raiz") && docs.includes("opportunities") && docs.includes("profiles.full_name"));
assert("documentação prioriza Kanban decision-first", docs.includes("Kanban decision-first redesign") && docs.includes("próxima ação comercial"));
assert("documentação define próximas 5 fases", docs.includes("Fase 107") && docs.includes("Fase 111"));
assert("configuração registra os achados críticos", config.criticalFindings.length >= 4 && config.nextFixPhases.length === 5);

const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? "✓" : "✗"} ${check.name}`);
}

if (failed.length) {
  console.error(`\nFase 106 incompleta: ${failed.length} falha(s).`);
  process.exit(1);
}

console.log("\nFase 106 validada: auditoria operacional registrada e próxima correção priorizada.");
