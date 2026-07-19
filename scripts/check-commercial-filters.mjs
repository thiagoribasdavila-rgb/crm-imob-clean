import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("config/commercial-filters.json"));
const endpoint = read(contract.endpoint);
const page = read(contract.page);
const legacyPage = read("app/(crm)/leads/filters/page.tsx");
const failures = [];

for (const marker of ["attention", "source", "development_id", "assigned_to", "team_owner", "next_action"]) {
  if (!endpoint.includes(marker)) failures.push(`filtro de API ausente: ${marker}`);
}
for (const marker of ["overdue", "no_action", "hot", "unassigned", "today", "next_7_days", "scheduled"]) {
  if (!endpoint.includes(marker) || !page.includes(marker)) failures.push(`atalho comercial incompleto: ${marker}`);
}
if (!endpoint.includes("requireAccessContext") || !endpoint.includes('.eq("organization_id", access.access.organization.id)')) failures.push("filtros sem escopo autenticado da organização");
if (!(endpoint.includes("descendantIds") || endpoint.includes("profileTeamScope")) || !endpoint.includes("TEAM_OUT_OF_SCOPE") || !endpoint.includes("OWNER_OUT_OF_SCOPE")) failures.push("responsável/equipe sem validação hierárquica");
for (const marker of ["Minha rotina", "Encontre rapidamente onde agir", "Filtrar por origem", "Filtrar por projeto", "Filtrar por corretor", "Filtrar por próxima ação", "Limpar filtros"]) {
  if (!page.includes(marker)) failures.push(`experiência comercial ausente: ${marker}`);
}
if (!legacyPage.includes('redirect("/leads")')) failures.push("rota antiga de filtros mantém experiência duplicada");

if (failures.length) {
  console.error("FILTROS COMERCIAIS Fase 28: REPROVADO");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`FILTROS COMERCIAIS Fase 28: aprovado — ${contract.quickFilters.length} atalhos, ${contract.dimensions.length} dimensões e escopo hierárquico preservado.`);
