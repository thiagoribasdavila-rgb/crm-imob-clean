import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const contract = JSON.parse(read("config/follow-up-sla.json"));
const sql = read(contract.migration).toLowerCase();
const analytics = read(contract.analytics);
const dashboard = read(contract.dashboard);
const failures = [];

for (const marker of ["follow_up_sla_events", "next_action_at", "scheduled_at", "completed_at", "response_minutes", "delay_minutes", "on_time", "for update", "one_open_cycle"]) {
  if (!sql.includes(marker)) failures.push(`ciclo sem controle: ${marker}`);
}
for (const status of contract.statuses) {
  if (!sql.includes(`'${status}'`)) failures.push(`estado ausente: ${status}`);
}
for (const activity of contract.validActivities) {
  if (!sql.includes(`'${activity}'`)) failures.push(`interação válida ausente: ${activity}`);
}
for (const metric of contract.metrics) {
  if (!analytics.includes(metric) || !dashboard.includes(metric)) failures.push(`indicador não percorre API e painel: ${metric}`);
}
for (const marker of ["enable row level security", "can_access_commercial_lead", "revoke insert, update, delete"]) {
  if (!sql.includes(marker)) failures.push(`isolamento ausente: ${marker}`);
}
if (!dashboard.includes('data-phase="35-follow-up-sla"') || !dashboard.includes("Cadência, atraso e recuperação")) failures.push("experiência gerencial da fase 35 ausente");

if (failures.length) {
  console.error("SLA DE FOLLOW-UP Fase 35: REPROVADO");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SLA DE FOLLOW-UP Fase 35: aprovado — ${contract.statuses.length} estados, ${contract.validActivities.length} interações válidas e ${contract.metrics.length} indicadores.`);
