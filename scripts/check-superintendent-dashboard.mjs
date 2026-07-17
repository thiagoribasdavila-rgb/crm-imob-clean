import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("config/superintendent-dashboard.json"));
const endpoint = read(contract.endpoint);
const page = read(contract.page);
const failures = [];

for (const area of contract.requiredAreas) {
  const markers = {
    directManagers: "directManagersOnly", teamPresence: "commercial_presence", activeLeads: "activeLeads", hotLeads: "hotLeads", firstContactOverdue: "firstContactOverdue", followUpOverdue: "followUpOverdue", withoutNextAction: "withoutNextAction", distribution: "distribution", conversionBenchmark: "benchmark", interventions: "interventions",
  };
  if (!endpoint.includes(markers[area])) failures.push(`área ausente: ${area}`);
}
if (!endpoint.includes('roles: ["superintendent"]') || !endpoint.includes('actorRole !== "superintendent"')) failures.push("endpoint não é exclusivo da superintendência");
if (!endpoint.includes("profile.reports_to === identity.access.profile.id")) failures.push("gerentes não estão limitados à subordinação direta");
if (!endpoint.includes("profile.reports_to && managerIds.has(profile.reports_to)")) failures.push("corretores não estão limitados ao gerente direto");
if (!endpoint.includes("portfolio.length >= 30")) failures.push("comparação não possui amostra mínima explícita");
if (!endpoint.includes("automaticTransfer: false") || /\.(insert|update|delete|upsert)\(/.test(endpoint)) failures.push("painel pode executar decisão automática");
if (!page.includes('data-phase="23-superintendent-daily"')) failures.push("cockpit da fase 23 não está visível");
if (!page.includes("AMOSTRA BAIXA") || !page.includes("ESTRUTURAS PARALELAS EXCLUÍDAS")) failures.push("interface não explica limites da comparação");

if (failures.length) {
  console.error("SUPERINTENDENT DASHBOARD Fase 23: REPROVADO");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`SUPERINTENDENT DASHBOARD Fase 23: aprovado — ${contract.requiredAreas.length} áreas; gerentes diretos; equipes isoladas; amostra mínima; decisão humana.`);
