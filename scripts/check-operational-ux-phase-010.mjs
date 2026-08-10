import fs from "node:fs";

const files = [
  "config/operational-ux-phase-010-global-command-rail.json",
  "components/atlas/topbar.tsx",
  "tests/contracts/global-command-rail.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_010_GLOBAL_COMMAND_RAIL.md",
];

let failed = false;
for (const file of files) {
  const pass = fs.existsSync(file);
  console.log(`${pass ? "PASS" : "FAIL"}: ${file}`);
  if (!pass) failed = true;
}

const config = JSON.parse(fs.readFileSync(files[0], "utf8"));
const topbar = fs.readFileSync(files[1], "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const assertions = [
  [config.phase === 10, "identificador da fase"],
  [config.requirements.onePrimaryGlobalAction, "uma ação global primária"],
  [Object.values(config.infrastructureMutation).every((value) => value === false), "sem mutação de infraestrutura ou release"],
  [topbar.includes('data-global-command-rail="coordinated"'), "faixa de comando coordenada"],
  [topbar.includes('new Event("atlas:open-copilot")'), "Copilot acessível pelo topo"],
  [topbar.includes("atlas-topbar-utilities"), "assistência e avisos agrupados"],
  [styles.includes('~ .atlas-copilot-launcher'), "duplicidade flutuante removida no desktop"],
];

for (const [pass, label] of assertions) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failed = true;
}
if (failed) process.exit(1);
console.log("\nFase 10 aprovada: comandos globais coordenados sem perda funcional.");
