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
const forbiddenRepositoryReads = [
  '.from("opportunities")',
  '.from("developments")',
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
  ["Relações futuras não são consultadas", forbiddenRepositoryReads.every((value) => !repositories.includes(value))],
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
