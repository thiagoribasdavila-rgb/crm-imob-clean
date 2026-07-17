import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const contract = JSON.parse(read("config/first-contact-sla.json"));
const sql = read(contract.migration).toLowerCase();
const api = read(contract.pipelineApi);
const page = read(contract.pipelinePage);
const analytics = read(contract.managerAnalytics);
const failures = [];

for (const marker of ["first_contact_sla_policies", "default_minutes", "meta_minutes", "first_response_minutes", "first_contact_sla_met", "for update", "complete_first_contact_sla"]) {
  if (!sql.includes(marker)) failures.push(`controle ausente na migration: ${marker}`);
}
for (const activity of contract.validActivities) {
  if (!sql.includes(`'${activity}'`)) failures.push(`atividade válida não reconhecida: ${activity}`);
}
for (const status of contract.validMessageStatuses) {
  if (!sql.includes(`'${status}'`)) failures.push(`status de mensagem não reconhecido: ${status}`);
}
if (!sql.includes("current_organization_id") || !sql.includes("enable row level security")) failures.push("política não está isolada por organização");
for (const marker of contract.measurements.slice(0, 2)) {
  if (!api.includes(marker) || !page.includes(marker)) failures.push(`medição não percorre API e Kanban: ${marker}`);
}
for (const marker of contract.measurements) {
  if (!analytics.includes(marker)) failures.push(`indicador gerencial ausente: ${marker}`);
}
if (!page.includes("No SLA") || !page.includes("Fora do SLA")) failures.push("resultado do SLA não está claro no Kanban");

if (failures.length) {
  console.error("SLA DE PRIMEIRO CONTATO Fase 34: REPROVADO");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SLA DE PRIMEIRO CONTATO Fase 34: aprovado — ${contract.validActivities.length} interações válidas, prazo por origem e desempenho gerencial medido.`);
