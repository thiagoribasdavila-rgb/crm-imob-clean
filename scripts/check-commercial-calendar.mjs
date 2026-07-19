import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const contract = JSON.parse(read("config/commercial-calendar.json"));
const page = read(contract.page);
const api = read(contract.api);
const failures = [];

for (const source of ['from("tasks")', 'from("leads")', "due_date", "LIVE_LEAD_SELECT"]) {
  if (!api.includes(source)) failures.push(`fonte ativa ausente: ${source}`);
}
if (!api.includes("requireAccessContext") || !api.includes('.eq("organization_id", organizationId)')) failures.push("API sem autenticação e organização");
if (!api.includes("const visitRows") || !api.includes("next_action_at")) failures.push("fallback opcional de visitas ou próxima ação ausente");
if (api.includes('from("lead_visits")')) failures.push("API voltou a consultar a tabela de visitas ausente no banco ativo");
if (!page.includes('data-phase="46-commercial-calendar"') || !page.includes("FASE 46 · AGENDA COMERCIAL UNIFICADA")) failures.push("tela não comprova a fase 46");
for (const window of contract.windows) if (!page.includes(`'${window}'`) && !page.includes(`"${window}"`)) failures.push(`janela ausente: ${window}`);
if (!page.includes("Atualizar") || !page.includes("removeChannel")) failures.push("fallback ou limpeza realtime ausente");
if (!page.includes("nenhum cliente é contatado automaticamente")) failures.push("limite de automação não está explícito");

if (failures.length) {
  console.error("AGENDA COMERCIAL Fase 46: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`AGENDA COMERCIAL Fase 46: aprovada — ${contract.sources.length} fontes ativas, visitas opcionais e ${contract.windows.length} períodos.`);
