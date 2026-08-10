import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/campaign-decision-first.test.mjs"],
  { stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Fase 30 validada: campanhas orientadas a resultado e decisão.");
