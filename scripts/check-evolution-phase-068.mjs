import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-068-local-commercial-outcome-summary.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_068_LOCAL_COMMERCIAL_OUTCOME_SUMMARY.md");

const checks = [
  ["Fase 068 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 68", program.currentPhase >= 68],
  ["Taxonomia local cobre os resultados supervisionados", ["contacted", "no_response", "meeting_scheduled", "proposal_sent", "follow_up_needed", "not_interested", "other"].every((value) => engine.includes(`key: "${value}"`))],
  ["Motor aceita somente evidência humana confirmada e vinculada", engine.includes('event.eventType === "copilot_task_outcome_recorded"') && engine.includes("event.humanConfirmed") && engine.includes("Boolean(event.taskId)") && engine.includes("Boolean(event.leadId)") && engine.includes("isCommercialOutcomeCode(event.outcome)")],
  ["Resultado mais recente por tarefa evita dupla contagem", engine.includes("latestOutcomeByTask") && engine.includes("if (!latestOutcomeByTask.has(evidenceKey))")],
  ["Política local proíbe modelo, previsão e escrita downstream", engine.includes("localOnly: true") && engine.includes("generativeModelUsed: false") && engine.includes("predictiveClaim: false") && engine.includes("downstreamWrites: false")],
  ["Motor local não chama rede ou provedor generativo", !engine.includes("fetch(") && !engine.includes("OPENAI_API_KEY") && !engine.includes("PERPLEXITY_API_KEY")],
  ["API lê somente eventos necessários no período do tenant", route.includes('.from("lead_events")') && route.includes('.eq("organization_id", organizationId)') && route.includes('"copilot_task_completed", "copilot_task_outcome_recorded"') && route.includes('.gte("created_at", outcomeHistoryStart)')],
  ["Sessão, RLS e no-store permanecem obrigatórios", route.includes("requireAccessContext(request)") && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Falha do resumo não derruba a fila operacional", route.includes("if (tasksResult.error || leadsResult.error)") && route.includes("available: !outcomeEventsResult.error")],
  ["Rota de leitura não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot consome e atualiza o resumo após registro", dock.includes("commercialOutcomeSummary?: CommercialOutcomeSnapshot") && dock.includes("setCommercialOutcomeSummary(queuePayload.data?.commercialOutcomeSummary ?? null)") && dock.includes("recordConfirmedTaskOutcome")],
  ["Interface explica custo, período e limites", dock.includes("O que a execução produziu") && dock.includes("Local · sem custo IA") && dock.includes("somente fatos confirmados · sem previsão ou alteração automática")],
  ["Interface possui estados útil vazio e indisponível", dock.includes("A amostra começa com o primeiro resultado confirmado") && dock.includes("A fila operacional continua disponível normalmente")],
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
console.log("Fase 068 verificada: resultados humanos consolidados localmente, explicáveis e sem custo generativo ou automação downstream.");
