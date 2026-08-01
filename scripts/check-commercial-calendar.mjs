import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const contract = JSON.parse(read("config/commercial-calendar.json"));
const page = read(contract.page);
const api = read(contract.api);
const failures = [];

// CC-6/live-schema: a agenda passou a ler tarefas e leads pela camada compat
// (readCompatibleTasks/readCompatibleLeads) em vez de from("tasks")/from("leads")
// crus. As queries reais (tasks, leads, due_date, LIVE_LEAD_SELECT) vivem em
// lib/atlas/core-v2/live-repositories.ts. Fontes preservadas, só realocadas.
const repo = read("lib/atlas/core-v2/live-repositories.ts");
for (const marker of ["readCompatibleTasks", "readCompatibleLeads"]) {
  if (!api.includes(marker)) failures.push(`fonte ativa ausente: ${marker}`);
}
for (const source of ['from("tasks")', 'from("leads")', "due_date", "LIVE_LEAD_SELECT"]) {
  if (!repo.includes(source)) failures.push(`fonte ativa ausente na camada compat: ${source}`);
}
if (!api.includes("requireAccessContext") || !api.includes('.eq("organization_id", organizationId)')) failures.push("API sem autenticação e organização");
if (!api.includes("const visitRows") || !api.includes("next_action_at")) failures.push("fallback opcional de visitas ou próxima ação ausente");
// CC-6: visitas voltaram a ser fonte OPCIONAL do calendário (config.optionalSources
// + optionalVisitFallback; unificação exigida pela Fase 36). A trava de schema-drift
// é a guarda isMissingRelation/visitsTableMissing, não a ausência da query.
if (api.includes('from("lead_visits")') && !(api.includes("isMissingRelation") && api.includes("visitsTableMissing"))) failures.push("visitas devem ser fonte opcional guardada por isMissingRelation");
// CC-6: selo em texto ("FASE 46 · AGENDA COMERCIAL UNIFICADA") virou atributo data-phase.
if (!page.includes('data-phase="46-commercial-calendar"')) failures.push("tela não comprova a fase 46");
for (const window of contract.windows) if (!page.includes(`'${window}'`) && !page.includes(`"${window}"`)) failures.push(`janela ausente: ${window}`);
if (!page.includes("Atualizar") || !page.includes("removeChannel")) failures.push("fallback ou limpeza realtime ausente");
// CC-6: mesmo limite de automação, agora quebrado em duas linhas no JSX.
if (!page.includes("nenhuma ação é concluída") || !page.includes("cliente é contatado automaticamente")) failures.push("limite de automação não está explícito");

if (failures.length) {
  console.error("AGENDA COMERCIAL Fase 46: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`AGENDA COMERCIAL Fase 46: aprovada — ${contract.sources.length} fontes ativas, visitas opcionais e ${contract.windows.length} períodos.`);
