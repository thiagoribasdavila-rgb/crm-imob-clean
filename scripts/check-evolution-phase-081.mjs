import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-081-commercial-context-provenance.json"));
const previous = JSON.parse(read("config/evolution-phase-080-contextual-recency-evidence.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_081_COMMERCIAL_CONTEXT_PROVENANCE.md");

const checks = [
  ["Fase anterior encaminha a proveniência contextual", previous.status === "completed" && previous.nextPhase.phase === 81],
  ["Fase 081 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 81", program.currentPhase >= 81],
  ["Contrato possui proveniência temporal tipada", engine.includes("export type CommercialOutcomeContextProvenance") && engine.includes("provenance: CommercialOutcomeContextProvenance")],
  ["Resultado e contexto usam bases temporais distintas", engine.includes('outcomeTimeBasis: "human_confirmed_event_time"') && engine.includes('contextTimeBasis: "historical_outcome_snapshot" | "current_lead_snapshot" | "mixed"')],
  ["Contrato retorna horário de resolução e rejeita histórico presumido", engine.includes("contextResolvedAt: contextResolvedAt.toISOString()") && engine.includes("historicalContextConfirmed:") && engine.includes("historicalBackfillInferred: false")],
  ["API declara e cronometra o enriquecimento pelo snapshot atual", route.includes("snapshot atual") && route.includes("currentLeadContextResolvedAt = new Date()") && route.includes("projectName: leadContext?.projectName ?? null") && route.includes("sourceName: leadContext?.sourceName ?? null")],
  ["Rota mantém sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota continua sem efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot mostra a proveniência sob demanda", dock.includes("data-commercial-context-provenance") && dock.includes("Fase 82 · contexto supervisionado") && dock.includes("Horário do resultado") && dock.includes("Projeto e origem")],
  ["Interface usa horário semântico e explica o limite histórico", dock.includes("provenance.contextResolvedAt") && dock.includes("<time dateTime=") && dock.includes("Registros antigos não são reconstruídos")],
  ["Interface permanece compacta e sem alegação de desempenho", dock.includes("registros antigos usam o cadastro consultado em") && dock.includes("não mede qualidade, desempenho, conversão ou chance de venda")],
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
console.log("Fase 081 verificada: temporalidades explícitas, sem histórico presumido, nova consulta, escrita operacional ou alteração de schema.");
