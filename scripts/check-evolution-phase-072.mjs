import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-072-factual-context-outcome-detail.json"));
const previous = JSON.parse(read("config/evolution-phase-071-local-commercial-outcome-context.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_072_FACTUAL_CONTEXT_OUTCOME_DETAIL.md");

const checks = [
  ["Fase anterior encaminha o detalhamento factual", previous.status === "completed" && previous.nextPhase.phase === 72],
  ["Fase 072 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 72", program.currentPhase >= 72],
  ["Segmento contextual expõe composição tipada", engine.includes("outcomes: CommercialOutcomeCategory[]") && engine.includes("outcomeCountsByContext") && engine.includes("segmentOutcomes")],
  ["Composição usa somente a taxonomia comercial governada", engine.includes("commercialOutcomeDefinitions") && engine.includes("outcomeCounts.get(definition.key)") && engine.includes("category.count > 0")],
  ["Percentual é calculado no próprio contexto", engine.includes("percentage(outcomeCounts.get(definition.key) ?? 0, segment.observedTasks)")],
  ["Resultado mais recente e humano por tarefa permanece obrigatório", engine.includes('event.eventType === "copilot_task_outcome_recorded"') && engine.includes("event.humanConfirmed") && engine.includes("latestOutcomeByTask")],
  ["Rota mantém sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot usa divulgação progressiva nativa", dock.includes('data-commercial-outcome-detail="factual-aggregate"') && dock.includes("Fase 72 · abra um projeto ou origem") && dock.includes("<details>") && dock.includes("<summary")],
  ["Interface mostra somente composição agregada", dock.includes("segment.outcomes.map") && dock.includes("outcome.sharePercent}% do contexto") && !dock.includes("segment.leads")],
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
console.log("Fase 072 verificada: composição factual dos resultados por projeto e origem disponível sob demanda, sem exposição individual, inferência ou escrita downstream.");
