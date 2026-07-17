import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-design-system.json", '"phase": 2', '"status": "completed"', '"canonical_components"');
need("config/final-10-phases-improvement.json", '"current_phase": 2', '"completed": [1, 2]');
need("components/atlas/metric-card.tsx", "AtlasMetric", "canonicalTone");
need("components/atlas/status-badge.tsx", "AtlasBadge");
need("components/atlas/empty-state.tsx", "AtlasEmpty");
need("components/ui/AtlasUI.tsx", 'role="status"', 'role="progressbar"');
need("app/globals.css", ":focus-visible", "prefers-reduced-motion: reduce");
need("docs/FINAL_PHASE_2_DESIGN_SYSTEM.md", "Componentes oficiais", "Critério de aceite");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nDesign system aprovado: ${checks.length} controles; Fase Final 2 concluída.`);
