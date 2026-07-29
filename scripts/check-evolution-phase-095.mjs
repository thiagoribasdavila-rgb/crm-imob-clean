import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-094-supabase-live-contract-audit.json");
const phase = json("config/evolution-phase-095-live-read-compatibility-layer.json");
const program = json("config/evolution-program-3000.json");
const resolver = read("lib/atlas/core-v2/live-capability-resolver.ts");
const repositories = read("lib/atlas/core-v2/live-repositories.ts");
const index = read("lib/atlas/core-v2/index.ts");
const report = read("docs/EVOLUTION_PHASE_095_LIVE_READ_COMPATIBILITY_LAYER.md");
/**
 * 2026-07-29 — `app/api/v1/customers/route.ts` (a 4ª integração entregue por
 * esta fase) foi APAGADA. Ela chamava `readCompatibleCustomers` apenas com
 * `{ organizationId, limit: 5000 }`, sem `ownerId`, delegando a fronteira ao
 * RLS — cuja política `leads_org_access` é PERMISSIVE por organização e anula
 * o recorte por dono. Um corretor via as 469 leads da imobiliária inteira.
 * A tela que a consumia, /customers, era a mesma tabela `leads` de /leads e
 * hoje só redireciona.
 *
 * O config NÃO foi editado: `delivered.routeIntegrations` é o registro do que a
 * fase entregou, e isso não muda retroativamente. O que muda é a leitura: os
 * arquivos ainda presentes são indexados POR NOME (antes era por posição, o que
 * silenciosamente deslocaria as asserções ao remover um item da lista).
 */
const routeFiles = phase.delivered.routeIntegrations;
const routeSources = Object.fromEntries(
  routeFiles.filter((file) => fs.existsSync(file)).map((file) => [file, read(file)]),
);
const customersRedirect = read("app/(crm)/customers/page.tsx");

const requiredModules = ["leads", "pipeline", "tasks-and-agenda", "customers-360", "developments"];

/**
 * ── REAPONTADA EM 2026-07-29 — `developments` deixou de ser domínio futuro ───
 *
 * A lista original proibia três leituras: `opportunities`, `customers` e
 * `developments`. A propriedade que ela guarda continua valendo e é boa: a
 * camada de compatibilidade não pode ler uma casca vazia, porque tela vazia é
 * pior que tela ausente — quem abre conclui que não há dado, quando há.
 *
 * MEDIDO NO BANCO VIVO (pozbrcsfthnhmnebfoxv, 29/07/2026):
 *   · public.opportunities — existe, 0 linhas
 *   · public.customers     — existe, 0 linhas
 *   · public.leads         — 470 linhas
 *   · public.developments  — 4 linhas, e 192 leads apontam para ela
 *   · public.crm_projects  — 4 linhas, e 0 leads apontam para ela
 *
 * Ou seja: para `opportunities` e `customers` a proibição segue exata — ler
 * qualquer uma delas mostraria zero onde existem 470 leads. Para
 * `developments` o fato virou: a migration 20260727010000 a tornou a canônica
 * (37 colunas `development_id` no schema apontam para lá) e
 * lib/atlas/core-v2/live-repositories.ts foi deliberadamente repontado. Antes
 * disso a tela de Projetos mostrava quatro empreendimentos com ZERO leads,
 * sendo que o Inside Perdizes sozinho tem 174.
 *
 * Manter `developments` na lista seria proibir justamente a leitura certa. Em
 * vez de só remover a linha, a asserção passa a provar OS DOIS LADOS: as duas
 * cascas continuam fora, e a leitura de empreendimento tem de estar na tabela
 * povoada — não na abandonada.
 */
const forbiddenRepositoryReads = [
  '.from("opportunities")',
  '.from("customers")',
];

const checks = [
  ["Fase 94 foi preservada", previous.phase === 94 && previous.status === "completed"],
  ["Fase 95 foi concluída sem mutar banco ou Auth", phase.phase === 95 && phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false && phase.authenticationChanged === false],
  ["Programa contínuo avançou para 95", program.currentPhase >= 95],
  ["Cinco domínios prioritários foram registrados", requiredModules.length === phase.delivered.priorityModules.length && requiredModules.every((module) => phase.delivered.priorityModules.includes(module) && resolver.includes(`module: "${module}"`))],
  ["Versão única de compatibilidade é exposta", resolver.includes("live-read-compat-v1") && repositories.includes("ATLAS_LIVE_READ_COMPATIBILITY_VERSION")],
  ["Aliases críticos estão centralizados", resolver.includes('score: "score_ia"') && resolver.includes('due_at: "due_date"') && resolver.includes('development_id: "crm_projects.id"')],
  ["Todas as leituras físicas aplicam tenant explícito", (repositories.match(/\.from\(/g) || []).length === (repositories.match(/\.eq\("organization_id", organizationId\)/g) || []).length],
  ["RLS autenticada é preservada sem service role", repositories.includes("SupabaseClient") && !repositories.includes("getSupabaseAdmin") && !repositories.includes("SERVICE_ROLE")],
  ["Cascas vazias não são consultadas e o portfólio lido é o povoado", forbiddenRepositoryReads.every((value) => !repositories.includes(value)) && repositories.includes('.from("developments")') && !repositories.includes('.from("crm_projects")')],
  ["Pipeline usa o repositório canônico", routeSources["app/api/v1/pipeline/route.ts"].includes("readCompatiblePipeline")],
  ["Tarefas e calendário usam os repositórios canônicos", routeSources["app/api/v1/tasks/route.ts"].includes("readCompatibleTasks") && routeSources["app/api/v1/calendar/route.ts"].includes("readCompatibleTasks") && routeSources["app/api/v1/calendar/route.ts"].includes("readCompatibleLeads")],
  // A rota de clientes foi apagada (ver cabeçalho). O que esta asserção sempre
  // quis dizer continua verdadeiro e agora está EXPLÍCITO na fonte: "clientes"
  // nunca foi uma leitura própria — `readCompatibleCustomers` só reetiqueta a
  // origem de `readCompatibleLeads`. E o destino segue alcançável.
  ["Clientes 360 é a mesma leitura canônica de leads", !fs.existsSync("app/api/v1/customers/route.ts") && repositories.includes("const leads = await readCompatibleLeads(client, input);\n  return leads.ok ? { ...leads, source: \"public.leads+public.profiles+public.crm_projects\" } : leads;") && customersRedirect.includes('redirect("/leads")')],
  ["Launch OS usa developments e pipeline compatíveis", routeSources["app/api/v1/launch-os/route.ts"].includes("readCompatibleDevelopments") && routeSources["app/api/v1/launch-os/route.ts"].includes("readCompatiblePipeline")],
  ["Core V2 exporta a nova fronteira", index.includes('export * from "./live-capability-resolver"') && index.includes('export * from "./live-repositories"')],
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
console.log("Fase 095 verificada: cinco domínios operacionais usam uma camada viva, canônica, tenant-safe e sem migration em lote.");
