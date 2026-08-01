import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-069-explainable-outcome-period-comparison.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_069_EXPLAINABLE_OUTCOME_PERIOD_COMPARISON.md");

const checks = [
  ["Fase 069 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 69", program.currentPhase >= 69],
  ["Motor constrói uma comparação comercial tipada", engine.includes("export type CommercialOutcomeComparison") && engine.includes("export function buildCommercialOutcomeComparison")],
  ["Janelas equivalentes não contam a fronteira duas vezes", engine.includes("new Date(current.periodStart).getTime() - 1") && engine.includes("buildCommercialOutcomeSummary(events, previousEnd, periodDays)")],
  ["Métricas preservam atual, anterior, delta e unidade", ["current", "previous", "delta", "direction", "percentage-points"].every((value) => engine.includes(value))],
  ["Amostra vazia ou insuficiente não simula comparabilidade", engine.includes('sampleStatus: "empty" | "insufficient" | "descriptive"') && engine.includes("const comparable = current.observedTasks > 0 && previous.observedTasks > 0")],
  ["Política proíbe modelo, causalidade, previsão e escrita", engine.includes("generativeModelUsed: false") && engine.includes("causalClaim: false") && engine.includes("predictiveClaim: false") && engine.includes("absoluteDeltasOnly: true") && engine.includes("downstreamWrites: false")],
  ["Motor local não chama rede ou provedor generativo", !engine.includes("fetch(") && !engine.includes("OPENAI_API_KEY") && !engine.includes("PERPLEXITY_API_KEY")],
  ["API lê dois períodos no tenant autenticado", route.includes("const outcomeLookbackDays = outcomePeriodDays * 2") && route.includes('.gte("created_at", outcomeHistoryStart)') && route.includes('.eq("organization_id", organizationId)') && route.includes("buildCommercialOutcomeComparison")],
  ["Sessão, RLS e no-store continuam obrigatórios", route.includes("requireAccessContext(request)") && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota comparativa não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot mostra comparação compacta e limites", dock.includes("Fase 69 · comparação temporal") && dock.includes("dias atuais ×") && dock.includes("Leitura descritiva") && dock.includes("Amostra inicial") && dock.includes("sem atribuir causa · sem previsão · nenhuma ação automática")],
  ["Interface mostra atual, anterior e diferença", dock.includes("Atual") && dock.includes("Antes") && dock.includes("Dif.") && dock.includes("metric.delta")],
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
console.log("Fase 069 verificada: períodos equivalentes comparados localmente, sem causalidade, previsão, custo generativo ou escrita downstream.");
