import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/explainable-supervised-ai-recommendation.test.mjs"],
  { cwd: process.cwd(), stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  "Fase 54 validada: recomendações exibem evidência, confiança honesta e ação supervisionada sem execução autônoma.",
);
