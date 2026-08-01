import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * 2026-07-29 — A ASSERÇÃO DE PROJETOS ESTAVA APOIADA NUMA CONSTANTE MORTA.
 *
 * Ela exigia a string "canonical-developments-domain-not-live" no texto de
 * live-write-readiness.ts. Essa string só existe dentro do export
 * ATLAS_LIVE_WRITE_READINESS_LEGACY_DEVELOPMENT_BLOCKERS, que NINGUÉM lê —
 * grep em lib/, app/, scripts/ e tests/ devolve só a própria declaração. O
 * objeto vivo bloqueia por outro motivo ("Ativação aguarda migration isolada").
 *
 * Provado por mutação: trocar state:"blocked" por state:"ready" — exatamente a
 * mudança de comportamento que a asserção diz vigiar — deixava a guarda VERDE.
 * Guarda que não morde é pior que guarda ausente: ela promete cobertura.
 *
 * Agora o módulo é EXECUTADO e o estado é lido do objeto vivo.
 */
function prontidaoDeEscrita() {
  const fonte = fs.readFileSync("lib/atlas/core-v2/live-write-readiness.ts", "utf8");
  const saida = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: {} };
  vm.runInNewContext(saida, {
    module: modulo,
    exports: modulo.exports,
    // O módulo importa o catálogo de páginas para derivar hrefs; devolvemos um
    // proxy tolerante porque o que se quer aqui é o ESTADO, não a rota.
    require: () => new Proxy({}, { get: () => () => ({ href: "", label: "" }) }),
  });
  return modulo.exports;
}

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-096-module-operational-health.json");
const phase = json("config/evolution-phase-097-write-readiness.json");
const program = json("config/evolution-program-3000.json");
const resolver = read("lib/atlas/core-v2/live-write-readiness.ts");
const health = read("lib/atlas/core-v2/live-operational-health.ts");
const route = read("app/api/v1/core-v2/module-health/route.ts");
// ── REAPONTADA EM 2026-07-29 — o Command Center mudou de arquivo ────────────
// Ver o cabeçalho de scripts/check-evolution-phase-096.mjs: /dashboard virou um
// redirect de 18 linhas para /command-center (commit d7112d24) e o bloco de
// saúde e escrita segura foi extraído para
// components/atlas/command-center-module-health.tsx.
const commandCenterHealth = read("components/atlas/command-center-module-health.tsx");
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
  // ── REAPONTADA EM 2026-07-29 — a escrita compensatória virou o PLANO B ─────
  //
  // A asserção procurava o comentário em inglês "compensating write". Ele
  // sumiu quando o arquivo foi reescrito em português — e um comentário nunca
  // foi prova de nada: apagá-lo não muda uma linha de comportamento.
  //
  // O que mudou de verdade, e para melhor: a rota ganhou
  // `rpc("move_pipeline_lead")` como caminho preferencial, que troca a etapa e
  // grava o histórico DENTRO de uma transação. A escrita compensatória — muda
  // a etapa, tenta auditar, desfaz se a auditoria falhar — continua existindo
  // como recuo para bancos sem a RPC, e agora se DECLARA na resposta
  // (`writeSafety: "compensating-write"`, `auditSource: "pipeline_history"`)
  // em vez de só se comentar. Verificado no banco vivo (pozbrcsfthnhmnebfoxv,
  // 29/07/2026): a função public.move_pipeline_lead existe.
  //
  // A asserção afirma a propriedade nos dois caminhos: conflito detectado
  // (`expectedFromStage`), auditoria em `pipeline_history`, caminho atômico
  // presente e recuo compensatório declarado na resposta.
  ["Pipeline tem conflito, histórico, caminho atômico e recuo compensatório declarado", pipeline.includes("expectedFromStage") && pipeline.includes('from("pipeline_history")') && pipeline.includes('rpc("move_pipeline_lead"') && pipeline.includes("p_expected_from_stage") && pipeline.includes('writeSafety: "compensating-write"') && pipeline.includes('auditSource: "pipeline_history"')],
  ["Tarefas preservam contexto, tenant e confirmação humana", tasks.includes("requireAccessContext") && tasks.includes('from("tasks").insert') && tasks.includes("humanConfirmed") && tasks.includes('eq("organization_id", organizationId)')],
  ["Clientes 360 grava pela fonte Lead 360", resolver.includes('state: "source-mediated"') && resolver.includes('mode: "lead-source"') && resolver.includes('href: "/leads"')],
  ["Projetos permanecem bloqueados enquanto o domínio futuro não está vivo", (() => {
    // Lê o ESTADO do objeto vivo, não uma string do arquivo. A escrita de
    // empreendimento continua atrás de portão manual: destravá-la muda
    // comportamento de produto e exige migration isolada + teste de papéis.
    const modulo = prontidaoDeEscrita();
    // O módulo devolve um MAPA por módulo, não uma lista — conferido lendo a
    // função em vez de supor a forma. Supor é como se chega a uma guarda que
    // não morde.
    const capacidades = typeof modulo.listOperationalWriteCapabilities === "function"
      ? modulo.listOperationalWriteCapabilities()
      : null;
    const projetos = capacidades ? capacidades.developments : null;
    const bloqueado = projetos ? projetos.state === "blocked" : null;
    // `null` = não consegui ler. Não medido NUNCA vira aprovado.
    return bloqueado === true
      && resolver.includes('href: "/developments/homologation"')
      && developments.includes('from("developments")')
      && developments.includes('rpc("upsert_complete_development"');
  })()],
  ["Saúde evoluiu para v2 e resume a escrita", health.includes('module-health-v2') && health.includes("resolveOperationalWriteReadiness") && health.includes("writeReady") && health.includes("writeBlocked")],
  ["Fronteira de saúde não ganhou chave administrativa", !health.includes("getSupabaseAdmin") && !route.includes("getSupabaseAdmin") && !route.includes("SERVICE_ROLE")],
  ["Rota registra estados sem expor erros brutos", route.includes("writeStates") && !route.includes("error.message") && !route.includes("error.details")],
  ["Command Center orienta a ação segura de cada módulo", commandCenterHealth.includes("module.write.label") && commandCenterHealth.includes("module.write.actionLabel") && commandCenterHealth.includes("module.write.href") && ["ready", "source-mediated", "blocked"].every((state) => commandCenterHealth.includes(`"${state}"`))],
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
