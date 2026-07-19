import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-096-module-operational-health.json");
const phase = json("config/evolution-phase-097-write-readiness.json");
const program = json("config/evolution-program-3000.json");
const resolver = read("lib/atlas/core-v2/live-write-readiness.ts");
const health = read("lib/atlas/core-v2/live-operational-health.ts");
const route = read("app/api/v1/core-v2/module-health/route.ts");
const dashboard = read("app/(crm)/dashboard/page.tsx");
const leads = read("app/api/v1/leads/route.ts");
const pipeline = read("app/api/v1/pipeline/route.ts");
const tasks = read("app/api/v1/tasks/route.ts");
const developments = read("app/api/v1/developments/route.ts");
const index = read("lib/atlas/core-v2/index.ts");
const report = read("docs/EVOLUTION_PHASE_097_WRITE_READINESS.md");

const requiredModules = ["leads", "pipeline", "tasks-and-agenda", "customers-360", "developments"];

const checks = [
  ["Fase 96 foi preservada", previous.phase === 96 && previous.status === "completed"],
  ["Fase contínua 97 foi concluída sem mutar banco, Auth ou dados reais", phase.phase === 97 && phase.program === "continuous" && phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false && phase.authenticationChanged === false],
  ["Programa contínuo avançou para 97", program.currentPhase >= 97],
  ["Cinco módulos prioritários têm prontidão de escrita", requiredModules.every((module) => phase.delivered.priorityModules.includes(module) && resolver.includes(module.includes("-") ? `\"${module}\"` : `${module}:`))],
  ["Estados de escrita são explícitos", ["ready", "source-mediated", "blocked"].every((state) => resolver.includes(`\"${state}\"`))],
  ["Falha de leitura sempre bloqueia escrita", phase.delivered.readFailureBlocksWrite === true && resolver.includes('module.state === "unavailable"') && resolver.includes('"module-read-unavailable"')],
  ["Leads têm identidade, tenant, duplicidade e auditoria", leads.includes("requireApiIdentity") && leads.includes('eq("organization_id", identity.organizationId)') && leads.includes("duplicateId") && leads.includes("recordLiveLeadEvent")],
  ["Pipeline tem conflito, histórico e escrita compensatória", pipeline.includes("expectedFromStage") && pipeline.includes('from("pipeline_history")') && pipeline.includes("compensating write")],
  ["Tarefas preservam contexto, tenant e confirmação humana", tasks.includes("requireAccessContext") && tasks.includes('from("tasks").insert') && tasks.includes("humanConfirmed") && tasks.includes('eq("organization_id", organizationId)')],
  ["Clientes 360 grava pela fonte Lead 360", resolver.includes('state: "source-mediated"') && resolver.includes('mode: "lead-source"') && resolver.includes('href: "/leads"')],
  ["Projetos permanecem bloqueados enquanto o domínio futuro não está vivo", resolver.includes('canonical-developments-domain-not-live') && resolver.includes('href: "/developments/homologation"') && developments.includes('from("developments")') && developments.includes('rpc("upsert_complete_development"')],
  ["Saúde evoluiu para v2 e resume a escrita", health.includes('module-health-v2') && health.includes("resolveOperationalWriteReadiness") && health.includes("writeReady") && health.includes("writeBlocked")],
  ["Fronteira de saúde não ganhou chave administrativa", !health.includes("getSupabaseAdmin") && !route.includes("getSupabaseAdmin") && !route.includes("SERVICE_ROLE")],
  ["Rota registra estados sem expor erros brutos", route.includes("writeStates") && !route.includes("error.message") && !route.includes("error.details")],
  ["Command Center orienta a ação segura de cada módulo", dashboard.includes("module.write.label") && dashboard.includes("module.write.actionLabel") && dashboard.includes("module.write.href")],
  ["Core V2 exporta prontidão de escrita", index.includes('export * from "./live-write-readiness"')],
  ["Relatório cobre problema, impacto, riscos e validação", report.includes("Problema resolvido") && report.includes("Impacto operacional") && report.includes("Riscos identificados") && report.includes("Checklist de validação")],
  ["Build e ZIP continuam reservados à Fase 100", phase.release.buildExecuted === false && phase.release.zipCreated === false && phase.release.checkpointPhase === 100],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 097 verificada: cinco módulos separam leitura de escrita e nenhuma ação futura é anunciada como pronta sem evidência.");
