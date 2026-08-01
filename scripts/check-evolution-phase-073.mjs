import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-073-factual-context-temporal-comparison.json"));
const previous = JSON.parse(read("config/evolution-phase-072-factual-context-outcome-detail.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_073_FACTUAL_CONTEXT_TEMPORAL_COMPARISON.md");

const checks = [
  ["Fase anterior encaminha a comparação contextual", previous.status === "completed" && previous.nextPhase.phase === 73],
  ["Fase 073 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 73", program.currentPhase >= 73],
  ["Contrato contextual compara períodos equivalentes", engine.includes("CommercialOutcomeContextComparison") && engine.includes("currentPeriod") && engine.includes("previousPeriod")],
  ["Janelas não se sobrepõem", engine.includes("const previousEndMs = currentStartMs - 1") && engine.includes("const previousStartMs = previousEndMs - periodDays * 86_400_000")],
  ["Resultado humano mais recente por tarefa é reutilizado", engine.includes("latestObservedOutcomes") && engine.includes('event.eventType === "copilot_task_outcome_recorded"') && engine.includes("event.humanConfirmed")],
  ["Comparação usa contagens brutas e diferença assinada", engine.includes("currentObservedTasks") && engine.includes("previousObservedTasks") && engine.includes("rawCountDeltasOnly: true")],
  ["Projeto e origem sem classificação permanecem explícitos", engine.includes("currentUnclassifiedTasks") && engine.includes("previousUnclassifiedTasks")],
  ["API entrega comparação dentro da memória governada", route.includes("buildCommercialOutcomeContextComparison") && route.includes("contextComparison: commercialOutcomeContextComparison")],
  ["Rota mantém sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot mostra atual, anterior e diferença sem taxa", dock.includes('data-commercial-context-comparison="raw-counts-only"') && dock.includes("Fase 73 · comparação contextual") && dock.includes("Atual") && dock.includes("Antes") && dock.includes("Dif.")],
  ["Interface declara limites de interpretação", dock.includes("diferenças de contagem, não taxas") && dock.includes("sem ranking, causa, previsão ou ação automática")],
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
console.log("Fase 073 verificada: projeto e origem comparados por contagens factuais em janelas equivalentes, sem taxa, ranking, inferência ou escrita downstream.");
