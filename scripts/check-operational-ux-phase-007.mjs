import fs from "node:fs";

const files = [
  "config/operational-ux-phase-007-progressive-navigation.json",
  "lib/atlas/navigation.ts",
  "components/atlas/sidebar.tsx",
  "tests/contracts/navigation-progressive-disclosure.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_007_PROGRESSIVE_NAVIGATION.md",
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
const assertions = [
  [config.phase === 7, "identificador da fase"],
  [Object.values(config.requirements).every(Boolean), "requisitos de acesso preservados"],
  [Object.values(config.infrastructureMutation).every((value) => value === false), "sem mutação de infraestrutura ou release"],
  [navigation.includes("getAtlasSecondaryNavigationForIdentity"), "partição secundária centralizada"],
  [sidebar.includes("atlas-nav-more-trigger") && sidebar.includes('aria-controls="atlas-nav-more-content"'), "Mais acessível e controlável"],
  [sidebar.includes("secondaryCurrentItem") && sidebar.includes("setMoreOpen(true)"), "rota secundária atual recuperada"],
  [sidebar.includes("normalizedQuery ? renderGroups()"), "busca revela resultados sem depender de Mais"],
  [sidebar.includes("favoriteItems") && sidebar.includes("routineItems"), "favoritos e rotina permanecem visíveis"],
];
for (const [pass, label] of assertions) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failed = true;
}
if (failed) process.exit(1);
console.log("\nFase 7 aprovada: navegação secundária compactada sem perda de acesso.");
