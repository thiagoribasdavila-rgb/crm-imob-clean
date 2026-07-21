import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-design-system.json", '"phase": 2', '"status": "completed"', '"canonical_components"');
const program = JSON.parse(fs.readFileSync("config/final-10-phases-improvement.json", "utf8"));
checks.push(["config/final-10-phases-improvement.json: fase atual não regrediu", Number(program.current_phase) >= 2]);
checks.push(["config/final-10-phases-improvement.json: fases 1 e 2 concluídas", [1, 2].every((phase) => program.completed?.includes(phase))]);
need("components/atlas/metric-card.tsx", "AtlasMetric", "canonicalTone");
// CC-5 renomeou o badge canônico deste arquivo de AtlasBadge para StatusBadge
// (commit "AtlasCard/Metric, StatusBadge e PageHeader no padrão CC-5"). O
// componente continua existindo aqui; AtlasBadge segue como badge legado em
// components/ui/AtlasUI.tsx (source of truth em config/final-design-system.json).
need("components/atlas/status-badge.tsx", "StatusBadge");
need("components/atlas/empty-state.tsx", "AtlasEmpty");
need("components/ui/AtlasUI.tsx", 'role="status"', 'role="progressbar"');
need("app/globals.css", ":focus-visible", "prefers-reduced-motion: reduce");
need("docs/FINAL_PHASE_2_DESIGN_SYSTEM.md", "Componentes oficiais", "Critério de aceite");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nDesign system aprovado: ${checks.length} controles; Fase Final 2 concluída.`);
