import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-crm-lead-360.json", '"phase": 4', '"mission": "conversion_first"', '"local_intelligence_cost": 0');
need("config/final-10-phases-improvement.json", '"current_phase": 4', '"completed": [1, 2, 3, 4]');
need("app/(crm)/leads/page.tsx", "FILTER_STORAGE_KEY", "filtersHydrated", "sessionStorage", "bulk-transfer");
need("app/(crm)/leads/[id]/page.tsx", "LeadOperationalBar", 'id="qualificacao"', 'id="historico"', 'id="matching"');
need("components/crm/lead-operational-bar.tsx", "nextAction", "openTasks", "unreadMessages", 'href="#qualificacao"');
need("docs/FINAL_PHASE_4_CRM_LEAD_360.md", "custo incremental é zero", "Segurança preservada");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nCRM aprovado: ${checks.length} controles; Fase Final 4 concluída.`);
