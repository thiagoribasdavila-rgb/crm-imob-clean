import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-navigation-mobile.json", '"phase": 3', '"mobile_reference_width": 390', '"role_aware_sidebar": true');
need("config/final-10-phases-improvement.json", '"current_phase": 3', '"completed": [1, 2, 3]');
need("components/atlas/app-shell.tsx", "MobileDock");
need("components/atlas/mobile-dock.tsx", 'aria-label="Ações rápidas"', 'aria-current', "atlas:open-command-palette");
need("components/atlas/sidebar.tsx", "visibleItems", "item.roles", 'aria-current');
need("components/CommandPalette.tsx", "keepFocusInside", 'role="dialog"', "document.body.style.overflow");
need("app/globals.css", "env(safe-area-inset-bottom)", ".atlas-mobile-dock", "100dvh");
need("docs/FINAL_PHASE_3_NAVIGATION_MOBILE.md", "Referência de homologação: 390 px", "Continuidade operacional");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nNavegação aprovada: ${checks.length} controles; Fase Final 3 concluída.`);
