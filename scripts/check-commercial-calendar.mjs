import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const contract = JSON.parse(read("config/commercial-calendar.json"));
const page = read(contract.page);
const api = read(contract.api);
const failures = [];

if (!api.includes("readCompatibleTasks") || !api.includes("task.due_at")) failures.push("fonte compatível de tarefas ausente");
if (!api.includes("readCompatibleLeads") || !api.includes("next_action_at")) failures.push("fonte compatível de leads ausente");
if (!api.includes("requireAccessContext") || !api.includes('.eq("organization_id", organizationId)')) failures.push("API sem autenticação e organização");
if (!api.includes('from("lead_visits")') || !api.includes("const visitRows") || !api.includes("visits.error")) failures.push("fonte opcional de visitas sem fallback seguro");
if (!page.includes("46-commercial-calendar") || !page.includes('data-calendar-layout="time-first"') || !page.includes("Tarefas, visitas e follow-ups permanecem em uma única")) failures.push("tela não comprova a fase 46");
for (const window of contract.windows) if (!page.includes(`'${window}'`) && !page.includes(`"${window}"`)) failures.push(`janela ausente: ${window}`);
if (!page.includes("Atualizar") || !page.includes("removeChannel")) failures.push("fallback ou limpeza realtime ausente");
if (!page.includes("nenhum cliente é contatado automaticamente")) failures.push("limite de automação não está explícito");

if (failures.length) {
  console.error("AGENDA COMERCIAL Fase 46: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`AGENDA COMERCIAL Fase 46: aprovada — ${contract.sources.length} fontes ativas, visitas opcionais e ${contract.windows.length} períodos.`);
