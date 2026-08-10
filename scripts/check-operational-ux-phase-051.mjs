import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/campaign-observed-journey.test.mjs"],
  { cwd: process.cwd(), stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  "Fase 51 validada: campanha, lead, atendimento e resultado aparecem em uma jornada factual, sem alegação causal.",
);
