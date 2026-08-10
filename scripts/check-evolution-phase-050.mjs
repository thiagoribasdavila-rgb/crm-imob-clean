import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-050-live-lead-contract.json"));
const sprint = JSON.parse(read("config/corrective-sprint-050-059.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const route = read("app/api/v1/crm/leads/route.ts");
const pipeline = read("app/api/v1/pipeline/route.ts");
const compat = read("lib/compat/legacy-v2.ts");
const liveRepositories = read("lib/atlas/core-v2/live-repositories.ts");
const report = read("docs/EVOLUTION_PHASE_050_LIVE_LEAD_CONTRACT.md");

const checks = [
  ["Fase 050 concluída sem alterar dados ou schema", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Sprint corretivo contém exatamente dez fases", sprint.phases.length === 10 && sprint.phases[0].phase === 50 && sprint.phases.at(-1).phase === 59],
  ["Programa contínuo avançou ao menos até a Fase 50", program.currentPhase >= 50],
  ["Contrato consulta somente campos do banco ativo", route.includes("LIVE_LEAD_SELECT") && compat.includes("score_ia") && compat.includes("assigned_user_id") && compat.includes("preferred_neighborhoods")],
  ["Consulta inválida e fallback massivo foram removidos", !route.includes('assigned_to, campaign_id, development_id') && !route.includes("limit(5000)") && !route.includes("isMissingColumn")],
  ["Paginação, filtros e ordenação permanecem no banco", route.includes(".range(offset, offset + limit - 1)") && route.includes('query.gte("score_ia"') && route.includes('query.eq("project_id"') && route.includes('query.eq("assigned_user_id"')],
  ["Etapas antigas são normalizadas", compat.includes('qualificado: "qualificacao"') && compat.includes('contato_realizado: "contato"') && compat.includes("compatibleLeadStatuses")],
  ["Pipeline mapeia o contrato antes de renderizar", pipeline.includes("readCompatiblePipeline") && liveRepositories.includes(".map(mapLegacyLead)") && pipeline.includes('stageSettingsSource = "canonical-defaults"')],
  ["Base histórica continua fora do fluxo operacional", route.includes("(arquivado,ARQUIVADO,archived,ARCHIVED)") && liveRepositories.includes("(arquivado,ARQUIVADO,archived,ARCHIVED)")],
  ["Relatório registra impacto e riscos restantes", report.includes("Impacto operacional") && report.includes("Fase 51") && phase.release.buildExecuted === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}
if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 050 verificada: leitura canônica sobre o banco real, sem consulta inválida ou paginação em memória.");
