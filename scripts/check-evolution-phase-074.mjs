import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-074-supervised-commercial-memory-period.json"));
const previous = JSON.parse(read("config/evolution-phase-073-factual-context-temporal-comparison.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_074_SUPERVISED_COMMERCIAL_MEMORY_PERIOD.md");

const checks = [
  ["Fase anterior encaminha o período supervisionado", previous.status === "completed" && previous.nextPhase.phase === 74],
  ["Fase 074 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 74", program.currentPhase >= 74],
  ["API oferece somente os três períodos governados", route.includes("const OUTCOME_PERIOD_OPTIONS = [7, 30, 90] as const") && route.includes("DEFAULT_OUTCOME_PERIOD_DAYS = 30")],
  ["Parâmetro é validado com erro seguro", route.includes('request.nextUrl.searchParams.get("outcomePeriodDays")') && route.includes("COPILOT_OUTCOME_PERIOD_INVALID") && route.includes("status: 400")],
  ["Consulta cobre duas janelas equivalentes e a fronteira anterior", route.includes("const outcomeLookbackDays = outcomePeriodDays * 2") && route.includes("outcomeLookbackDays * 86_400_000 - 1") && route.includes("currentWindowDays: outcomePeriodDays") && route.includes("previousWindowDays: outcomePeriodDays")],
  ["Limite histórico e amostra parcial são explícitos", route.includes("OUTCOME_HISTORY_LIMIT = 8_000") && route.includes("historyMayBeTruncated") && dock.includes("A leitura pode ser parcial")],
  ["Rota mantém sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot apresenta seletor acessível e supervisionado", dock.includes('data-commercial-outcome-period-control="supervised"') && dock.includes('aria-label="Período da memória comercial"') && dock.includes("aria-pressed={commercialOutcomePeriodDays === periodDays}")],
  ["Período é preservado nas atualizações da fila", dock.includes("commercialOutcomePeriodRef.current") && (dock.match(/dailyQueueUrl\(commercialOutcomePeriodRef\.current/g)?.length ?? 0) >= 4],
  ["Interface declara leitura sem efeito automático", dock.includes("A escolha altera somente a consulta") && dock.includes("sem chamada de modelo, escrita ou ação automática")],
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
console.log("Fase 074 verificada: memória comercial com períodos supervisionados de 7, 30 e 90 dias, janelas equivalentes e nenhuma escrita ou ação automática.");
