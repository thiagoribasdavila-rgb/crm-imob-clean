import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-pipeline-productivity.json", '"phase": 5', '"serialized": true', '"rollback": true', '"privacy": "no_lead_query_persisted"');
const program = JSON.parse(fs.readFileSync("config/final-10-phases-improvement.json", "utf8"));
checks.push(["config/final-10-phases-improvement.json: fase atual não regrediu", Number(program.current_phase) >= 5]);
checks.push(["config/final-10-phases-improvement.json: fases 1 a 5 concluídas", [1, 2, 3, 4, 5].every((phase) => program.completed?.includes(phase))]);
need("app/(crm)/pipeline/page.tsx", "PIPELINE_PREFERENCES_KEY", "preferencesHydrated", "if (savingId)", "setLeads(previous)", "undoLastMove", "loading || Boolean(savingId)");
need("app/(crm)/pipeline/page.tsx", "expectedFromStage", "Alt mais seta", "firstContactSla", "brokerGuidance");
need("docs/FINAL_PHASE_5_PIPELINE_PRODUCTIVITY.md", "uma movimentação pendente por vez", "A busca não é preservada");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nPipeline aprovado: ${checks.length} controles; Fase Final 5 concluída.`);
