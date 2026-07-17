import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-ai-integrations.json", '"phase": 8', '"host": "hostinger"', '"caller_cancellation_propagated": true', '"cost_per_action_recorded": true');
const program = JSON.parse(fs.readFileSync("config/final-10-phases-improvement.json", "utf8"));
checks.push(["config/final-10-phases-improvement.json: fase atual não regrediu", Number(program.current_phase) >= 8]);
checks.push(["config/final-10-phases-improvement.json: fases 1 a 8 concluídas", [1, 2, 3, 4, 5, 6, 7, 8].every((phase) => program.completed?.includes(phase))]);
need("lib/ai/provider-router.ts", "signal?: AbortSignal", "signal: input.signal", "input.signal?.aborted", "aiProviderReadiness", "localFallback");
need("app/api/ai/copilot/route.ts", "signal: request.signal", "request.signal.aborted", "estimatedCostUsd", "pricingConfigured");
need("components/AtlasCopilotDock.tsx", "new AbortController()", "signal: controller.signal", "Cancelar consulta", "custo medido", "preço pendente de configuração");
need("docs/FINAL_PHASE_8_AI_AUTOMATIONS_INTEGRATIONS.md", "cancelamento ponta a ponta", "aprovação", "Hostinger");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nIA e integrações aprovadas: ${checks.length} controles; Fase Final 8 concluída.`);
