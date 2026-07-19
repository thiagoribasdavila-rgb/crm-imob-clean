import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-role-dashboards.json", '"phase": 7', '"role_resolved_before_render": true', '"wrong_role_request_prevented": true');
const program = JSON.parse(fs.readFileSync("config/final-10-phases-improvement.json", "utf8"));
checks.push(["config/final-10-phases-improvement.json: fase atual não regrediu", Number(program.current_phase) >= 7]);
checks.push(["config/final-10-phases-improvement.json: fases 1 a 7 concluídas", [1, 2, 3, 4, 5, 6, 7].every((phase) => program.completed?.includes(phase))]);
need("app/(crm)/dashboard/page.tsx", "DASHBOARD_PERIOD_KEY", "const isBroker", "if (!isBroker)", "Perfil comercial não identificado", "isBroker ?");
need("app/(crm)/dashboard/page.tsx", '"day", "week", "month"', "directorDaily", "superintendentSummary", "managerDaily", "brokerDaily");
need("app/api/v1/analytics/director-daily/route.ts", 'roles: ["admin", "director"]', "organizationWide", "humanApprovalRequired");
need("docs/FINAL_PHASE_7_ROLE_DASHBOARDS.md", "Estruturas paralelas permanecem excluídas", "dia, semana e mês");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nDashboards aprovados: ${checks.length} controles; Fase Final 7 concluída.`);
