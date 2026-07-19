import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-075-supervised-observed-outcome-filter.json"));
const previous = JSON.parse(read("config/evolution-phase-074-supervised-commercial-memory-period.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_075_SUPERVISED_OBSERVED_OUTCOME_FILTER.md");

const preservedRefreshes = dock.match(/dailyQueueUrl\(commercialOutcomePeriodRef\.current, commercialOutcomeFilterRef\.current\)/g)?.length ?? 0;

const checks = [
  ["Fase anterior encaminha o filtro supervisionado", previous.status === "completed" && previous.nextPhase.phase === 75],
  ["Fase 075 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 75", program.currentPhase >= 75],
  ["API oferece Todos e a taxonomia governada", route.includes('type OutcomeFilter = "all" | CommercialOutcomeCode') && route.includes("commercialOutcomeDefinitions.map")],
  ["Parâmetro é validado com erro seguro", route.includes('request.nextUrl.searchParams.get("outcomeFilter")') && route.includes("COPILOT_OUTCOME_FILTER_INVALID") && route.includes("status: 400")],
  ["Filtro preserva conclusões e recorta somente o resultado correspondente", route.includes('event.eventType === "copilot_task_completed"') && route.includes('event.eventType === "copilot_task_outcome_recorded" && event.outcome === outcomeFilter')],
  ["Resumo filtrado mantém cobertura global", route.includes("allCommercialOutcomeSummary") && route.includes("filteredCommercialOutcomeSummary") && route.includes("coveragePercent: allCommercialOutcomeSummary.coveragePercent")],
  ["Comparação filtrada mantém cobertura global", route.includes("allCommercialOutcomeComparison") && route.includes("filteredCommercialOutcomeComparison") && route.includes("coveragePercent: allCommercialOutcomeComparison.metrics.coveragePercent")],
  ["Qualidade e lacunas usam todos os resultados", route.includes("buildCommercialOutcomeMemoryQuality(outcomeInputs") && !route.includes("buildCommercialOutcomeMemoryQuality(filteredOutcomeInputs")],
  ["Contextos descritivos respeitam o filtro", route.includes("buildCommercialOutcomeContextBreakdown(filteredOutcomeInputs") && route.includes("buildCommercialOutcomeContextComparison(filteredOutcomeInputs")],
  ["Contrato declara escopo, amostra e leitura supervisionada", route.includes("matchingObservedTasks") && route.includes("totalObservedTasks") && route.includes('qualityScope: "all-outcomes"') && route.includes('coverageScope: "all-outcomes"') && route.includes("supervised: true") && route.includes("readOnly: true")],
  ["Rota mantém sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot apresenta filtro acessível e supervisionado", dock.includes('data-commercial-outcome-filter-control="supervised"') && dock.includes('aria-label="Resultado observado da memória comercial"') && dock.includes("aria-pressed={commercialOutcomeFilter === option.value}")],
  ["Período e filtro são preservados nas atualizações governadas", dock.includes("commercialOutcomePeriodRef.current") && dock.includes("commercialOutcomeFilterRef.current") && preservedRefreshes >= 4],
  ["Interface mostra amostra e mantém integridade global explícita", dock.includes("matchingObservedTasks") && dock.includes("totalObservedTasks") && dock.includes("Cobertura e lacunas continuam globais") && dock.includes("Todos os resultados")],
  ["Estado vazio distingue recorte sem correspondência de memória vazia", dock.includes("Nenhum resultado corresponde a este filtro no período.") && dock.includes("A memória global permanece preservada.")],
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
console.log("Fase 075 verificada: filtro supervisionado por resultado humano confirmado, cobertura e lacunas globais e nenhuma escrita ou ação automática.");
