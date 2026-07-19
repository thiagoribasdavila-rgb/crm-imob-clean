import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-071-local-commercial-outcome-context.json"));
const previous = JSON.parse(read("config/evolution-phase-070-local-commercial-memory-quality.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_071_LOCAL_COMMERCIAL_OUTCOME_CONTEXT.md");

const checks = [
  ["Fase anterior encaminha o contexto comercial", previous.status === "completed" && previous.nextPhase.phase === 71],
  ["Fase 071 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 71", program.currentPhase >= 71],
  ["Motor expõe contexto e segmentos tipados", engine.includes("export type CommercialOutcomeContextBreakdown") && engine.includes("export type CommercialOutcomeContextSegment") && engine.includes("export function buildCommercialOutcomeContextBreakdown")],
  ["Somente resultados humanos válidos por tarefa entram", engine.includes('event.eventType === "copilot_task_outcome_recorded"') && engine.includes("event.humanConfirmed") && engine.includes("isCommercialOutcomeCode(event.outcome)") && engine.includes("latestOutcomeByTask")],
  ["Projeto e origem usam a resolução contextual governada sem inventar classificação", engine.includes("resolveCommercialOutcomeContext") && engine.includes("unclassifiedTasks") && engine.includes("historicalSnapshotPreferred: true") && engine.includes("currentLeadFallbackForLegacy: true")],
  ["Segmentos são compactos e contabilizam o restante", engine.includes("segments: ordered.slice(0, segmentLimit)") && engine.includes("remainingSegments") && engine.includes("remainingObservedTasks")],
  ["Política impede modelo, causalidade, previsão e escrita", engine.includes("generativeModelUsed: false") && engine.includes("causalClaim: false") && engine.includes("predictiveClaim: false") && engine.includes("downstreamWrites: false")],
  ["Motor local não chama rede ou provedor generativo", !engine.includes("fetch(") && !engine.includes("OPENAI_API_KEY") && !engine.includes("PERPLEXITY_API_KEY")],
  ["API enriquece eventos somente em memória", route.includes("leadContexts") && route.includes("projectName: leadContext?.projectName") && route.includes("sourceName: leadContext?.sourceName") && route.includes("buildCommercialOutcomeContextBreakdown")],
  ["Sessão, tenant, RLS e no-store continuam obrigatórios", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota contextual não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot mostra contexto compacto e descritivo", dock.includes("Fase 71 · contexto comercial") && dock.includes("Resultados por projeto e origem") && dock.includes('data-commercial-outcome-context="historical-preferred-with-legacy-fallback"') && dock.includes("classifiedTasks")],
  ["Interface explicita contexto histórico preferido e limites", dock.includes("Histórico preferido") && dock.includes("não atribui causa, não prevê conversão e não altera a operação")],
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
console.log("Fase 071 verificada: resultados humanos contextualizados localmente por projeto e origem, com evolução histórica compatível e sem causalidade, previsão ou escrita downstream.");
