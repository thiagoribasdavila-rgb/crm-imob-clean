import fs from "node:fs";

const files = [
  "config/operational-ux-phase-012-decisive-design-tokens.json",
  "styles/atlas-tokens.css",
  "tests/contracts/decisive-design-tokens.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_012_DECISIVE_DESIGN_TOKENS.md",
];

let failed = false;
for (const file of files) {
  const pass = fs.existsSync(file);
  console.log(`${pass ? "PASS" : "FAIL"}: ${file}`);
  if (!pass) failed = true;
}

const config = JSON.parse(fs.readFileSync(files[0], "utf8"));
const tokens = fs.readFileSync(files[1], "utf8");
const globals = fs.readFileSync("app/globals.css", "utf8");
const assertions = [
  [config.phase === 12, "identificador da fase"],
  [config.tokenGroups.length === 7, "sete grupos visuais governados"],
  [config.requirements.singleSemanticSource, "fonte semântica única"],
  [Object.values(config.infrastructureMutation).every((value) => value === false), "sem mutação de infraestrutura ou release"],
  [tokens.includes('data-desktop-density="compact"'), "densidade compacta por variáveis"],
  [globals.includes("--background: var(--atlas-canvas)"), "compatibilidade legada ligada aos tokens"],
  [globals.includes("padding: var(--atlas-density-card-padding)"), "componentes canônicos usam densidade"],
];

for (const [pass, label] of assertions) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failed = true;
}
if (failed) process.exit(1);
console.log("\nFase 12 aprovada: sistema visual consolidado sem alterar a operação.");
