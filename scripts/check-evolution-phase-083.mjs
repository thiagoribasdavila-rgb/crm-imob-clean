import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-083-historical-context-propagation.json"));
const previous = JSON.parse(read("config/evolution-phase-082-supervised-commercial-context-snapshot.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_083_HISTORICAL_CONTEXT_PROPAGATION.md");

const resolverUses = engine.match(/resolveCommercialOutcomeContext\(outcome\)/g)?.length ?? 0;

const checks = [
  ["Fase anterior encaminha a propagação histórica", previous.status === "completed" && previous.nextPhase.phase === 83],
  ["Fase 083 concluída sem alterar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 83", program.currentPhase >= 83],
  ["Motor expõe um resolvedor contextual central e tipado", engine.includes("export type CommercialOutcomeResolvedContext") && engine.includes("export function resolveCommercialOutcomeContext")],
  ["Snapshot histórico tem precedência explícita", engine.includes('outcome.contextBasis === "historical_outcome_snapshot"') && engine.includes("historicalSnapshot ? outcome.historicalProjectName : outcome.projectName") && engine.includes("historicalSnapshot ? outcome.historicalSourceName : outcome.sourceName")],
  ["Valor histórico nulo não recebe associação atual inventada", !engine.includes("outcome.historicalProjectName ?? outcome.projectName") && !engine.includes("outcome.historicalSourceName ?? outcome.sourceName") && engine.includes("Um snapshot histórico com valor nulo continua nulo")],
  ["Evidência auditável usa contexto e proveniência resolvidos", engine.includes("const context = resolveCommercialOutcomeContext(outcome)") && engine.includes("contextBasis: context.basis") && engine.includes("contextCapturedAt: context.capturedAt")],
  ["Recência, agrupamento e comparação compartilham o resolvedor", resolverUses >= 9 && engine.includes("resolveCommercialOutcomeContext(outcome).projectName") && engine.includes("resolveCommercialOutcomeContext(outcome).sourceName")],
  ["Recência não fabrica horário de captura ausente", engine.includes("contextCapturedAt: resolvedContext.capturedAt") && !engine.includes("resolvedContext.capturedAt ?? new Date(currentEndMs).toISOString()")],
  ["Política declara histórico preferido, fallback legado e ausência de backfill", engine.includes("historicalSnapshotPreferred: true") && engine.includes("currentLeadFallbackForLegacy: true") && engine.includes("historicalBackfillInferred: false") && !engine.includes("currentLeadContextOnly")],
  ["Copilot mostra a proveniência de cada evidência", dock.includes("Contexto preservado") && dock.includes("Fallback legado") && dock.includes("contextCapturedAt")],
  ["Interface identifica a propagação sem esconder limites", dock.includes("Fase 83 · todas as leituras usam o contexto preservado") && dock.includes('data-commercial-outcome-context="historical-preferred-with-legacy-fallback"') && dock.includes("sem backfill")],
  ["API mantém parser estrito e fallback legado explícito", route.includes("commercialContextSnapshotFrom") && route.includes('? "historical_outcome_snapshot"') && route.includes(': "current_lead_snapshot"') && route.includes("nunca reconstruído como histórico")],
  ["Rota preserva sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Leitura contextual continua sem efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Relatório registra impacto, segurança, compatibilidade, risco e próxima etapa", report.includes("Impacto operacional") && report.includes("Segurança e governança") && report.includes("Compatibilidade") && report.includes("Risco identificado") && report.includes("Próxima etapa recomendada")],
  ["Release continua bloqueado até o gate", phase.release.zipCreated === false && phase.release.buildExecuted === false && phase.release.gatesApproved === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 083 verificada: contexto histórico propagado de forma consistente, fallback legado explícito e nenhuma reconstrução, escrita ou automação.");
