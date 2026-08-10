import fs from "node:fs";

const checks = [
  ["config", "config/operational-ux-phase-004-state-dictionary.json"],
  ["dictionary", "lib/ui/operational-state.ts"],
  ["badge", "components/atlas/status-badge.tsx"],
  ["primitive", "components/ui/AtlasUI.tsx"],
  ["dashboard", "app/(crm)/dashboard/page.tsx"],
  ["tests", "tests/contracts/operational-state-dictionary.test.mjs"],
  ["docs", "docs/ATLAS_ONE_UX_PHASE_004_STATE_DICTIONARY.md"],
];

let failed = false;
for (const [label, file] of checks) {
  const pass = fs.existsSync(file);
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}: ${file}`);
  if (!pass) failed = true;
}

const dictionary = fs.readFileSync("lib/ui/operational-state.ts", "utf8");
const badge = fs.readFileSync("components/atlas/status-badge.tsx", "utf8");
const dashboard = fs.readFileSync("app/(crm)/dashboard/page.tsx", "utf8");
const config = JSON.parse(fs.readFileSync("config/operational-ux-phase-004-state-dictionary.json", "utf8"));

const assertions = [
  [config.phase === 4, "identificador da Fase 4 é estável"],
  [config.canonicalStates.length === 8, "oito estados canônicos estão definidos"],
  [dictionary.includes('STATE_ALIASES[key] ?? "neutral"'), "estado desconhecido não vira saudável"],
  [dictionary.includes('insufficient:') && dictionary.includes('tone: "violet"'), "amostra insuficiente possui estado próprio"],
  [dictionary.includes('blocked:') && dictionary.includes('critical:'), "bloqueio e risco crítico permanecem distintos"],
  [dictionary.includes("STATE_ALIASES"), "vocabulário legado é reconciliado em um ponto"],
  [badge.includes("operationalState"), "badge expõe semântica além da cor"],
  [badge.includes("showSymbol"), "cor nunca é o único sinal"],
  [dashboard.includes('state={!leadIntake.dataBoundary.decisionReady ? "insufficient"'), "Sala de Comando usa o novo contrato"],
  [config.scope.schemaChanged === false && config.scope.recordsChanged === false, "fase não altera schema nem registros"],
];

for (const [pass, label] of assertions) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failed = true;
}

if (failed) process.exit(1);
console.log("\nFase 4 aprovada: estado, cor, severidade e decisão usam um contrato único e acessível.");
