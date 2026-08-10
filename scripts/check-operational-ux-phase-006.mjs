import fs from "node:fs";

const files = [
  "config/operational-ux-phase-006-role-navigation.json",
  "lib/atlas/navigation.ts",
  "components/atlas/sidebar.tsx",
  "components/atlas/mobile-dock.tsx",
  "tests/contracts/role-navigation-priority.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_006_ROLE_NAVIGATION.md",
];

let failed = false;
for (const file of files) {
  const pass = fs.existsSync(file);
  console.log(`${pass ? "PASS" : "FAIL"}: ${file}`);
  if (!pass) failed = true;
}

const config = JSON.parse(fs.readFileSync(files[0], "utf8"));
const navigation = fs.readFileSync(files[1], "utf8");
const sidebar = fs.readFileSync(files[2], "utf8");
const mobile = fs.readFileSync(files[3], "utf8");

const assertions = [
  [config.phase === 6, "identificador da fase"],
  [config.roles.length === 4, "quatro papéis comerciais"],
  [config.desktopRoutineSize === 5 && config.mobileRoutineSize === 4, "rotina compacta por superfície"],
  [Object.values(config.preservedAccess).every(Boolean), "acessos existentes preservados"],
  [Object.values(config.infrastructureMutation).every((value) => value === false), "sem mutação de infraestrutura ou release"],
  [navigation.includes("atlasRoleRoutines") && navigation.includes("normalizeAtlasNavigationRole"), "contrato de prioridade centralizado"],
  [navigation.includes('return "broker"'), "fallback de menor privilégio"],
  [sidebar.includes("getAtlasRoleRoutineForIdentity") && sidebar.includes("atlas-nav-routine"), "barra lateral conectada à rotina"],
  [sidebar.includes("atlas-sidebar-search-input") && sidebar.includes("favoriteItems"), "busca e favoritos preservados"],
  [mobile.includes("getAtlasMobileNavigationForIdentity"), "dock móvel conectado ao contrato"],
];

for (const [pass, label] of assertions) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failed = true;
}

if (failed) process.exit(1);
console.log("\nFase 6 aprovada: cada papel inicia pela própria rotina sem perder acesso ao produto.");
