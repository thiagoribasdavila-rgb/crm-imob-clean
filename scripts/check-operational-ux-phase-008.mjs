import fs from "node:fs";

const files = [
  "config/operational-ux-phase-008-information-ownership.json",
  "components/atlas/sidebar.tsx",
  "components/atlas/topbar.tsx",
  "tests/contracts/navigation-information-ownership.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_008_INFORMATION_OWNERSHIP.md",
];

let failed = false;
for (const file of files) {
  const pass = fs.existsSync(file);
  console.log(`${pass ? "PASS" : "FAIL"}: ${file}`);
  if (!pass) failed = true;
}

const config = JSON.parse(fs.readFileSync(files[0], "utf8"));
const sidebar = fs.readFileSync(files[1], "utf8");
const topbar = fs.readFileSync(files[2], "utf8");
const assertions = [
  [config.phase === 8, "identificador da fase"],
  [Object.values(config.requirements).every(Boolean), "contexto e acessibilidade preservados"],
  [Object.values(config.infrastructureMutation).every((value) => value === false), "sem mutação de infraestrutura ou release"],
  [sidebar.includes("atlas-nav-copy sr-only"), "resultado removido da repetição visual"],
  [sidebar.includes('aria-current={active ? "page" : undefined}'), "rota atual semanticamente identificada"],
  [!sidebar.includes("atlas-nav-current atlas-sidebar-label"), "marcador Agora redundante removido"],
  [sidebar.includes("atlas-sidebar-decision sr-only"), "estado redundante preservado apenas semanticamente"],
  [sidebar.includes("<strong>Protegido</strong>"), "rodapé visual compactado"],
  [topbar.includes("atlas-topbar-outcome") && topbar.includes("decisionOutcome"), "topo mantém o resultado da tela"],
];
for (const [pass, label] of assertions) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failed = true;
}
if (failed) process.exit(1);
console.log("\nFase 8 aprovada: informação tem proprietário visual único e mantém contexto acessível.");
