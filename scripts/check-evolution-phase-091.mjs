import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-090-atlas-core-v2-contracts.json");
const phase = json("config/evolution-phase-091-detailed-structural-gap-audit.json");
const backlog = json("config/atlas-core-v2-gap-backlog.json");
const program = json("config/evolution-program-3000.json");
const report = read("docs/EVOLUTION_PHASE_091_DETAILED_STRUCTURAL_GAP_AUDIT.md");

const criticalIds = ["P0-01", "P0-02", "P0-03", "P0-04", "P0-05", "P0-06"];
const findingsById = new Map(backlog.findings.map((finding) => [finding.id, finding]));
const releasePhases = backlog.releaseCandidatePlan.map((item) => item.phase);
const criticalComplete = criticalIds.every((id) => {
  const finding = findingsById.get(id);
  return finding
    && finding.priority === "P0"
    && finding.businessImpact
    && finding.treatment
    && Array.isArray(finding.targetPhases)
    && finding.targetPhases.length > 0
    && Array.isArray(finding.exitCriteria)
    && finding.exitCriteria.length >= 3;
});

const checks = [
  ["Fase 90 foi preservada", previous.status === "completed" && previous.phase === 90],
  ["Fase 91 conclui auditoria sem alterar runtime, schema ou dados", phase.status === "completed" && phase.runtimeBehaviorChanged === false && phase.databaseSchemaChanged === false && phase.productionDataModified === false],
  ["Programa contínuo avançou para 91", program.currentPhase >= 91],
  ["Inventário contém páginas, APIs, migrations, boundaries e testes", backlog.measuredInventory.pages >= 271 && backlog.measuredInventory.apiRoutes >= 142 && backlog.measuredInventory.supabaseMigrations >= 122 && backlog.measuredInventory.loadingBoundaries === 1 && backlog.measuredInventory.errorBoundaries === 1 && backlog.measuredInventory.conventionalTestFiles === 0],
  ["Limitações impedem tratar varredura estática como verdade de produção", backlog.measurementLimits.includes("filesystem-counts-do-not-prove-live-production-state") && backlog.measurementLimits.includes("migration-statements-do-not-prove-they-were-applied") && backlog.measurementLimits.includes("configured-integrations-do-not-count-as-operational-without-a-successful-live-test")],
  ["Seis lacunas P0 possuem impacto, tratamento, fase e saída", criticalComplete],
  ["Backlog inclui pipeline, design, IA, Digital Twin e integrações", ["P1-01", "P2-02", "P3-01", "P3-02", "P4-01"].every((id) => findingsById.has(id))],
  ["Fases de release 92 a 100 estão mapeadas em ordem", JSON.stringify(releasePhases) === JSON.stringify([92, 93, 94, 95, 96, 97, 98, 99, 100])],
  ["Kanban possui fase própria antes do gate", backlog.releaseCandidatePlan.find((item) => item.phase === 98)?.name.includes("kanban")],
  ["Supabase vivo separa schema, grant e RLS", findingsById.get("P0-02")?.exitCriteria.some((item) => item.includes("data-api-grants-and-rls-proven-separately"))],
  ["IA configurada não é promovida sem certificação", findingsById.get("P3-01")?.exitCriteria.some((item) => item.includes("certified-per-task"))],
  ["Digital Twin exige linhagem, cobertura e confiança", findingsById.get("P3-02")?.exitCriteria.some((item) => item.includes("source-events-data-freshness-coverage-and-confidence"))],
  ["Integração configurada nunca equivale a operacional", findingsById.get("P4-01")?.exitCriteria.includes("configured-never-means-operational")],
  ["Horizonte até 3000 continua orientado por evidência", backlog.executionWaves.at(-1)?.phases === "2001-3000" && backlog.executionWaves.at(-1)?.outcome.includes("evidence-driven")],
  ["Relatório cobre inventário, fases, Supabase, riscos e impacto", report.includes("Resultado executivo") && report.includes("Plano corrigido das fases 92–100") && report.includes("Supabase e segurança") && report.includes("Impacto operacional") && report.includes("Riscos identificados")],
  ["Build e ZIP continuam bloqueados até a fase 100", backlog.releasePolicy.buildNow === false && backlog.releasePolicy.zipNow === false && backlog.releasePolicy.checkpointPhase === 100 && phase.release.checkpointPhase === 100],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 091 verificada: lacunas estruturais medidas, priorizadas e convertidas em fases com critérios de saída.");
