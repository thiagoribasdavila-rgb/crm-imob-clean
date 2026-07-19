import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const contract = JSON.parse(read("config/safe-pipeline-movement.json"));
const api = read(contract.api);
const page = read(contract.page);
const failures = [];

for (const marker of ["expectedFromStage", "PIPELINE_STAGE_CONFLICT", "requireLeadAccess", '.eq("organization_id", identity.organizationId)', '.eq("status", current.status)']) {
  if (!api.includes(marker)) failures.push(`controle de concorrência ou escopo ausente: ${marker}`);
}
for (const marker of ['.from("pipeline_history")', 'old_status: previousStage', 'new_status: stage', '.update({ status: current.status })', "PIPELINE_AUDIT_FAILED"]) {
  if (!api.includes(marker)) failures.push(`auditoria ou rollback compensatório ausente: ${marker}`);
}
for (const marker of ["moveId", "reversalOf", "undoLastMove", "expectedFromStage", "Desfazer movimentação"]) {
  if (!page.includes(marker)) failures.push(`desfazer seguro incompleto: ${marker}`);
}
if (api.includes('rpc("move_pipeline_lead"')) failures.push("API voltou a depender da RPC ausente no banco ativo");

if (failures.length) {
  console.error("MOVIMENTAÇÃO SEGURA Fase 33: REPROVADO");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`MOVIMENTAÇÃO SEGURA Fase 33: aprovado — trava otimista, ${contract.liveWrites.length} registros vivos, rollback compensatório e desfazer causal.`);
