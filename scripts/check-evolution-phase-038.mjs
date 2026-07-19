import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-038-task-execution-workspace.json", "utf8"));
const phaseThirtySeven = JSON.parse(fs.readFileSync("config/evolution-phase-037-pipeline-movement-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const tasks = fs.readFileSync("app/(crm)/tasks/page.tsx", "utf8");
const taskApi = fs.readFileSync("app/api/v1/tasks/route.ts", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_038_TASK_EXECUTION_WORKSPACE.md", "utf8");

const checks = [
  ["Fase 038 concluída sem mutação estrutural", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false && config.dataFetchingChanged === false],
  ["Fase anterior encaminha para Tarefas", phaseThirtySeven.status === "completed" && phaseThirtySeven.nextPhase.phase === 38],
  ["Central publica o contrato execution-first", tasks.includes('data-task-layout="execution-first"') && config.taskContract.layoutAttribute === "execution-first"],
  ["Primeiro bloco mostra quatro sinais objetivos", tasks.includes("O que precisa ser feito agora") && tasks.includes(">Vencidas<") && tasks.includes(">Hoje<") && tasks.includes(">Minha fila<") && tasks.includes(">Sem prazo<") && config.taskContract.primarySignals === 4],
  ["Assistente limita o foco a três ações", tasks.includes("assistant?.sequence.slice(0, 3)") && tasks.includes("assistant?.sequence.slice(3)") && config.taskContract.visibleDailyPriorities === 3],
  ["Ações restantes usam divulgação progressiva", tasks.includes("Ver outras {remainingSteps.length} ações planejadas") && config.informationHierarchy.remainingStepsProgressivelyDisclosed === true],
  ["Criação rápida e recorrência permanecem", tasks.includes('data-phase="42-task-quick-create"') && tasks.includes("FASE 43 · TAREFAS RECORRENTES") && tasks.includes('method:"POST"') && tasks.includes("maxOccurrences") && tasks.includes("endsAt")],
  ["Campos opcionais da criação não poluem o fluxo inicial", tasks.includes("Adicionar vínculo, descrição ou repetição") && tasks.includes('className="atlas-task-form-more"') && config.informationHierarchy.creationOptionalFieldsProgressivelyDisclosed === true],
  ["Filtros exibem contagem e semântica de abas", tasks.includes('role="tablist"') && tasks.includes('role="tab"') && tasks.includes("viewCounts[key]") && config.accessibility.filtersUseTabSemantics === true],
  ["Conclusão, reagendamento e recorrência seguem explícitos", tasks.includes('act(task,"complete")') && tasks.includes('act(task,"postpone_one_day")') && tasks.includes('act(task,"cancel_recurrence")') && config.executionPolicy.automaticTaskCompletion === false],
  ["API autenticada e escopo de tenant permanecem", taskApi.includes("requireAccessContext") && taskApi.includes("identity.access.organization.id") && taskApi.includes('.eq("organization_id"') && config.safetyPolicy.tenantIsolationPreserved === true && config.safetyPolicy.rbacPreserved === true],
  ["Nenhuma nova leitura de rede foi adicionada", (tasks.match(/fetch\("\/api\/v1\//g) || []).length === 4 && tasks.includes('fetch("/api/v1/tasks"') && tasks.includes('fetch("/api/v1/productivity/daily"') && config.structuralBaseline.newNetworkRequestAdded === false],
  ["Fila possui retorno acessível", tasks.includes('aria-live="polite"') && tasks.includes('aria-busy={loading}') && config.accessibility.queueUsesPoliteLiveRegion === true],
  ["Alvos e layouts responsivos estão definidos", styles.includes(".atlas-task-item-actions :is(a, button)") && styles.includes("min-height: 44px") && styles.includes(".atlas-task-signal-grid") && config.accessibility.minimumNewTouchTargetPx === 44],
  ["Equipe é apoio, não ranking", tasks.includes("não ranking de pessoas") && tasks.includes("isolado para avaliar desempenho") && config.executionPolicy.peopleRanking === false],
  ["Relatório registra verdade e próxima fase", report.includes("não criou score, probabilidade ou previsão") && report.includes("não publica alegação de produtividade") && report.includes("Fase 039")],
  ["Gate de homologação permanece bloqueado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false]
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 038 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 038 aprovada: Tarefas compactas, explicáveis e orientadas à execução humana.");
