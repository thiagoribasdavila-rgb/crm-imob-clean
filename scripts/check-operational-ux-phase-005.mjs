import fs from "node:fs";

const files = [
  "config/operational-ux-phase-005-decision-matrix.json",
  "lib/ui/screen-decision-contract.ts",
  "components/atlas/decision-contract-strip.tsx",
  "app/(crm)/dashboard/page.tsx",
  "tests/contracts/screen-decision-contract.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_005_DECISION_MATRIX.md",
];

let failed = false;
for (const file of files) {
  const pass = fs.existsSync(file);
  console.log(`${pass ? "PASS" : "FAIL"}: ${file}`);
  if (!pass) failed = true;
}

const config = JSON.parse(fs.readFileSync(files[0], "utf8"));
const matrix = fs.readFileSync(files[1], "utf8");
const component = fs.readFileSync(files[2], "utf8");
const dashboard = fs.readFileSync(files[3], "utf8");

const assertions = [
  [config.phase === 5, "identificador da fase"],
  [config.roles.length === 4, "quatro papéis comerciais"],
  [config.canonicalScreens.length === 9, "nove telas existentes mapeadas"],
  [config.requiredFields.every((field) => matrix.includes(`${field}:`)), "cinco campos de fechamento presentes"],
  [["director", "superintendent", "manager", "broker"].every((role) => matrix.includes(`${role}: {`)), "decisão por papel"],
  [matrix.includes('role === "admin"') && matrix.includes('return "broker"'), "admin segue diretoria e papel desconhecido não ganha privilégio"],
  [component.includes("<dt>Responsável</dt>") && component.includes("<dt>Comprovação</dt>"), "componente mostra dono e evidência"],
  [dashboard.includes("getScreenDecisionContract") && dashboard.includes("<DecisionContractStrip"), "Sala de Comando conectada ao contrato"],
  [Object.values(config.scope).every((value) => value === false), "sem mutação de infraestrutura ou release"],
];

for (const [pass, label] of assertions) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failed = true;
}

if (failed) process.exit(1);
console.log("\nFase 5 aprovada: cada decisão possui papel, responsável, prazo, resultado e comprovação.");
