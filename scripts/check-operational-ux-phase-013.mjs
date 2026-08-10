import fs from "node:fs";

const files = [
  "config/operational-ux-phase-013-semantic-color-discipline.json",
  "styles/atlas-tokens.css",
  "tests/contracts/semantic-color-discipline.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_013_SEMANTIC_COLOR_DISCIPLINE.md",
];

let failed = false;
for (const file of files) {
  const pass = fs.existsSync(file);
  console.log(`${pass ? "PASS" : "FAIL"}: ${file}`);
  if (!pass) failed = true;
}

const config = JSON.parse(fs.readFileSync(files[0], "utf8"));
const globals = fs.readFileSync("app/globals.css", "utf8");
const assertions = [
  [config.phase === 13, "identificador da fase"],
  [Object.keys(config.colorRoles).length === 5, "cinco papéis semânticos"],
  [config.requirements.singleActionHue, "uma cor de ação"],
  [config.requirements.neutralStructuralSurfaces, "estrutura neutra"],
  [Object.values(config.infrastructureMutation).every((value) => value === false), "sem mutação de infraestrutura ou release"],
  [globals.includes("background: var(--atlas-accent-strong)"), "ação primária sem gradiente multicolorido"],
  [globals.includes("background: linear-gradient(90deg, var(--atlas-border-strong), transparent)"), "separador estrutural neutro"],
];

for (const [pass, label] of assertions) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failed = true;
}
if (failed) process.exit(1);
console.log("\nFase 13 aprovada: cor comunica ação ou estado, não decoração.");
