import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-078-commercial-memory-freshness.json"));
const previous = JSON.parse(read("config/evolution-phase-077-auditable-commercial-outcome-evidence.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_078_COMMERCIAL_MEMORY_FRESHNESS.md");

const checks = [
  ["Fase anterior encaminha recência da memória", previous.status === "completed" && previous.nextPhase.phase === 78],
  ["Fase 078 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 78", program.currentPhase >= 78],
  ["Motor possui contrato e construtor tipados de recência", engine.includes("export type CommercialOutcomeFreshness") && engine.includes("export function buildCommercialOutcomeFreshness")],
  ["Limites operacionais são fixos e transparentes", engine.includes("COMMERCIAL_OUTCOME_FRESH_WITHIN_HOURS = 72") && engine.includes("COMMERCIAL_OUTCOME_STALE_AFTER_HOURS = 168")],
  ["Recência usa somente a janela atual e fatos humanos", engine.includes("latestObservedOutcomes(events, currentStartMs, currentEndMs)") && engine.includes("humanConfirmedOnly: true") && engine.includes("currentWindowOnly: true")],
  ["Estados vazio, atual, atenção e desatualizado são distintos", engine.includes('"empty" | "current" | "attention" | "stale"') && engine.includes('ageHours <= COMMERCIAL_OUTCOME_FRESH_WITHIN_HOURS') && engine.includes('ageHours <= COMMERCIAL_OUTCOME_STALE_AFTER_HOURS')],
  ["Contrato limita o indicador à idade observada", engine.includes("ageSignalOnly: true") && engine.includes("qualityClaim: false") && engine.includes("causalClaim: false") && engine.includes("predictiveClaim: false")],
  ["API calcula recência sobre o recorte filtrado", route.includes("buildCommercialOutcomeFreshness(filteredOutcomeInputs") && route.includes("freshness: commercialOutcomeFreshness") && route.includes('appliedTo: ["summary", "comparison", "evidence", "freshness"')],
  ["Rota mantém sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot mostra recência compacta e acessível", dock.includes("Fase 78 · recência factual") && dock.includes("data-commercial-outcome-freshness") && dock.includes('aria-label="Recência da memória comercial observada"')],
  ["Interface mostra último fato, contagem e limites", dock.includes("Último fato:") && dock.includes("resultado(s) no recorte") && dock.includes("currentMaxHours / 24") && dock.includes("staleAfterHours / 24")],
  ["Interface declara que recência não mede desempenho", dock.includes("não avalia qualidade, intenção, conversão ou chance de venda")],
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
console.log("Fase 078 verificada: recência factual explícita, limites transparentes e nenhuma previsão, chamada externa ou escrita operacional.");
