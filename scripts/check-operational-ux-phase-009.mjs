import fs from "node:fs";

const files = [
  "config/operational-ux-phase-009-page-header-hierarchy.json",
  "components/atlas/page-header.tsx",
  "tests/contracts/page-header-hierarchy.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_009_PAGE_HEADER_HIERARCHY.md",
];

let failed = false;
for (const file of files) {
  const pass = fs.existsSync(file);
  console.log(`${pass ? "PASS" : "FAIL"}: ${file}`);
  if (!pass) failed = true;
}

const config = JSON.parse(fs.readFileSync(files[0], "utf8"));
const component = fs.readFileSync(files[1], "utf8");
const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const canonicalFiles = ["leads", "pipeline", "tasks", "customers", "developments"]
  .map((area) => `app/(crm)/${area}/page.tsx`);
const assertions = [
  [config.phase === 9, "identificador da fase"],
  [config.requirements.onePrimaryActionMaximum, "uma ação primária por cabeçalho"],
  [Object.values(config.infrastructureMutation).every((value) => value === false), "sem mutação de infraestrutura ou release"],
  [component.includes('data-page-header="decision"'), "componente compartilhado governado"],
  [component.includes("atlas-page-decision"), "orientação decisória disponível"],
  [canonicalFiles.every((file) => fs.readFileSync(file, "utf8").includes('data-page-header="decision"')), "áreas canônicas aderentes"],
  [pipeline.includes("<h1") && pipeline.includes("Pipeline inteligente</h1>"), "título principal do pipeline corrigido"],
];

for (const [pass, label] of assertions) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failed = true;
}
if (failed) process.exit(1);
console.log("\nFase 9 aprovada: cabeçalhos canônicos seguem uma hierarquia decisória única.");
