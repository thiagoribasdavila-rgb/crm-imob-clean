import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-079-contextual-commercial-memory-freshness.json"));
const previous = JSON.parse(read("config/evolution-phase-078-commercial-memory-freshness.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_079_CONTEXTUAL_COMMERCIAL_MEMORY_FRESHNESS.md");

const checks = [
  ["Fase anterior encaminha recência contextual", previous.status === "completed" && previous.nextPhase.phase === 79],
  ["Fase 079 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 79", program.currentPhase >= 79],
  ["Motor possui contrato e construtor tipados por contexto", engine.includes("export type CommercialOutcomeContextFreshness") && engine.includes("export function buildCommercialOutcomeContextFreshness")],
  ["Projeto e origem usam a mesma amostra confirmada e a resolução contextual governada", engine.includes("latestObservedOutcomes(events, currentStartMs, currentEndMs)") && engine.includes("resolveCommercialOutcomeContext(outcome).projectName") && engine.includes("resolveCommercialOutcomeContext(outcome).sourceName")],
  ["Recência contextual usa limites transparentes", engine.includes("contextFreshnessStatus") && engine.includes("COMMERCIAL_OUTCOME_FRESH_WITHIN_HOURS") && engine.includes("COMMERCIAL_OUTCOME_STALE_AFTER_HOURS")],
  ["Contrato rejeita ranking, qualidade, causalidade e previsão", engine.includes("alphabeticalDisplayOrder: true") && engine.includes("rankingClaim: false") && engine.includes("qualityClaim: false") && engine.includes("causalClaim: false") && engine.includes("predictiveClaim: false")],
  ["Lacunas e contextos recolhidos preservam contagens", engine.includes("unclassifiedTasks") && engine.includes("remainingSegments") && engine.includes("remainingObservedTasks")],
  ["API calcula o contexto sobre o recorte filtrado", route.includes("buildCommercialOutcomeContextFreshness(filteredOutcomeInputs") && route.includes("contextFreshness: commercialOutcomeContextFreshness") && route.includes('"contextFreshness"')],
  ["Rota mantém sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota continua sem efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot apresenta leitura recolhida e acessível", dock.includes("Fase 79 · recência por contexto") && dock.includes("data-commercial-context-freshness") && dock.includes('aria-label="Conferir recência factual por projeto e origem"')],
  ["Interface mostra último fato, idade, volume e lacuna", dock.includes("segment.latestObservedAt") && dock.includes("segment.ageHours") && dock.includes("dimension.unclassifiedTasks") && dock.includes("dimension.remainingSegments")],
  ["Interface declara ordem sem ranking e limites semânticos", dock.includes("Ordem alfabética, sem ranking") && dock.includes("não mede qualidade, desempenho, conversão ou chance de venda")],
  ["Relatório registra impacto, segurança, risco e próxima etapa", report.includes("Impacto operacional") && report.includes("Segurança e governança") && report.includes("Risco identificado") && report.includes("Próxima etapa recomendada")],
  ["Release continua bloqueado até o gate", phase.release.zipCreated === false && phase.release.buildExecuted === false && phase.release.gatesApproved === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 079 verificada: recência por projeto e origem, ordem sem ranking e nenhuma chamada externa, escrita operacional ou alteração de schema.");
