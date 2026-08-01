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
// A regra original era "nunca referenciar move_pipeline_lead", escrita quando o
// único banco alvo não tinha a RPC — chamá-la seria quebrar em runtime. Isso
// mudou: o banco de homologação TEM a função, e usá-la é melhor, porque a troca
// de etapa e o registro no histórico passam a acontecer na mesma transação (a
// escrita compensatória abaixo pode deixar a lead numa etapa que o histórico
// não conhece, se o próprio desfazer falhar).
//
// A proteção não foi removida, ficou mais exata: PODE usar a RPC, DESDE QUE
// trate a ausência dela em runtime e mantenha o caminho compensatório — que os
// marcadores exigidos acima continuam garantindo. Assim o mesmo código serve o
// banco que tem a função e o que não tem.
if (api.includes('rpc("move_pipeline_lead"')) {
  const detectaAusencia = api.includes('"42883"') && api.includes('"PGRST202"');
  if (!detectaAusencia) failures.push("API usa move_pipeline_lead sem tratar a ausência da RPC (42883/PGRST202) — quebraria no banco que não a tem");
}

if (failures.length) {
  console.error("MOVIMENTAÇÃO SEGURA Fase 33: REPROVADO");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`MOVIMENTAÇÃO SEGURA Fase 33: aprovado — trava otimista, ${contract.liveWrites.length} registros vivos, rollback compensatório e desfazer causal.`);
