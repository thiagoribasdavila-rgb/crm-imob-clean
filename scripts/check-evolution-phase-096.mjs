import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-095-live-read-compatibility-layer.json");
const phase = json("config/evolution-phase-096-module-operational-health.json");
const program = json("config/evolution-program-3000.json");
const health = read("lib/atlas/core-v2/live-operational-health.ts");
const route = read("app/api/v1/core-v2/module-health/route.ts");
/**
 * ── REAPONTADA EM 2026-07-29 — o Command Center mudou de arquivo ────────────
 *
 * As três asserções de tela liam `app/(crm)/dashboard/page.tsx`. Esse arquivo
 * hoje tem 18 linhas e faz `redirect("/command-center")`: o commit d7112d24
 * fundiu Início e Sala de comando numa home única por papel, e /dashboard ficou
 * só como rota de compatibilidade para deep links, favoritos e atalhos antigos.
 *
 * Pior: o bloco de saúde dos módulos MORAVA dentro daquele page.tsx e era
 * importado de lá pelo Command Center — o que viola o contrato de página do
 * Next (um page.tsx só exporta default e campos reservados) e só não quebrava o
 * build porque o turbopack não valida esse contrato. Ele foi movido para
 * components/atlas/command-center-module-health.tsx, que é o lugar certo.
 *
 * Então a propriedade não morreu: mudou de casa duas vezes. Ler o redirect
 * media um proxy que o produto deixou para trás. As asserções agora leem o
 * componente onde a saúde de fato é renderizada, E provam o elo que o proxy
 * antigo dava de graça: que a home realmente monta esse componente e que o
 * deep link antigo continua chegando lá.
 */
const commandCenterHealth = read("components/atlas/command-center-module-health.tsx");
const commandCenter = read("app/(crm)/command-center/page.tsx");
const dashboardRedirect = read("app/(crm)/dashboard/page.tsx");

/**
 * O componente `nome` vem mesmo do módulo `modulo` — em QUALQUER das duas formas
 * legítimas de trazê-lo?
 *
 *   estática ..... import { Nome } from "modulo"
 *   sob demanda .. const Nome = dynamic(() => import("modulo")…)
 *
 * As duas montam o mesmo componente na mesma página. A diferença é só QUANDO o
 * JavaScript dele chega ao navegador — e um portão não tem por que ter opinião
 * sobre isso.
 *
 * `ssr: false` é recusado de propósito: aí sim a diferença é de comportamento, e
 * não de empacotamento — o painel deixaria de existir na renderização de
 * servidor.
 */
function montadoDeVerdade(fonte, nome, modulo) {
  const alvo = modulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const estatico = new RegExp(`import\\s*\\{[^}]*\\b${nome}\\b[^}]*\\}\\s*from\\s*"${alvo}"`).test(fonte);
  const sobDemanda = new RegExp(`const\\s+${nome}\\s*=\\s*dynamic\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*"${alvo}"`).test(fonte);
  if (!estatico && !sobDemanda) return false;
  // A declaração sob demanda não pode desligar a renderização de servidor.
  const declaracao = new RegExp(`const\\s+${nome}\\s*=\\s*dynamic\\([\\s\\S]{0,400}?\\n`).exec(fonte);
  return !(declaracao && /ssr\s*:\s*false/.test(declaracao[0]));
}
const index = read("lib/atlas/core-v2/index.ts");
const report = read("docs/EVOLUTION_PHASE_096_MODULE_OPERATIONAL_HEALTH.md");

const requiredModules = ["leads", "pipeline", "tasks-and-agenda", "customers-360", "developments"];
const directBrowserReads = [
  '.from("leads")',
  '.from("tasks")',
  '.from("crm_projects")',
  '.from("profiles")',
];

const checks = [
  ["Fase 95 foi preservada", previous.phase === 95 && previous.status === "completed"],
  ["Fase 96 foi concluída sem mutar banco, Auth ou dados reais", phase.phase === 96 && phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false && phase.authenticationChanged === false],
  ["Programa contínuo avançou para 96", program.currentPhase >= 96],
  ["Cinco módulos prioritários têm saúde independente", requiredModules.every((module) => phase.delivered.priorityModules.includes(module) && health.includes(`"${module}"`))],
  ["Estados operacionais são explícitos", ["operational", "degraded", "unavailable"].every((state) => health.includes(`"${state}"`))],
  ["Zero registros é saudável", phase.delivered.emptyDataIsHealthy === true && health.includes("Carteira pronta para receber leads")],
  ["Serviço reaproveita os repositórios canônicos", health.includes("readCompatibleLeads") && health.includes("readCompatibleTasks") && health.includes("readCompatibleDevelopments")],
  ["Leitura adicional de perfis aplica tenant explícito", health.includes('.from("profiles")') && health.includes('.eq("organization_id", organizationId)')],
  ["Serviço preserva RLS e não usa chave administrativa", health.includes("SupabaseClient") && !health.includes("getSupabaseAdmin") && !health.includes("SERVICE_ROLE")],
  ["Rota exige rate limit e contexto autenticado", route.includes("enforceRateLimit") && route.includes("requireAccessContext") && route.includes("readOperationalModuleHealth")],
  ["Rota não expõe erro bruto", !route.includes("error.message") && !route.includes("error.details")],
  ["Command Center usa uma única fronteira protegida", commandCenterHealth.includes('fetch("/api/v1/core-v2/module-health"') && directBrowserReads.every((value) => !commandCenterHealth.includes(value)) && directBrowserReads.every((value) => !commandCenter.includes(value))],
  ["Command Center apresenta os cinco semáforos", commandCenterHealth.includes("Saúde operacional dos módulos") && commandCenterHealth.includes("INITIAL_MODULE_HEALTH") && requiredModules.every((module) => commandCenterHealth.includes(`id: "${module}"`))],
  // A asserção conferia a LINHA DE IMPORT (`from "…"`). Quando o painel virou
  // carregamento sob demanda — `dynamic(() => import("…"))`, mesmo módulo, mesmo
  // nome, mesma montagem — ela ficou vermelha sem que nada tivesse quebrado.
  // Conferir a FORMA transforma o portão em trava contra otimização.
  //
  // O reaponta:mento é para a PROPRIEDADE: o componente vem daquele módulo,
  // amarrado àquele nome, e é montado na home. E fica MAIS FORTE que antes —
  // passa a recusar `ssr: false`, que tiraria o painel da renderização de
  // servidor e devolveria uma casca vazia a quem chega sem JavaScript.
  ["A home monta a saúde e o deep link antigo continua chegando nela", montadoDeVerdade(commandCenter, "CommandCenterModuleHealth", "@/components/atlas/command-center-module-health") && commandCenter.includes("<CommandCenterModuleHealth />") && dashboardRedirect.includes('redirect("/command-center")')],
  ["Falha parcial não é anunciada como pane geral", commandCenterHealth.includes("Atualização parcial do Command Center") && !commandCenterHealth.includes("Alguns módulos estão indisponíveis")],
  ["Core V2 exporta a saúde operacional", index.includes('export * from "./live-operational-health"')],
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
console.log("Fase 096 verificada: Command Center usa uma fronteira protegida e mede cinco módulos sem confundir base vazia com falha.");
