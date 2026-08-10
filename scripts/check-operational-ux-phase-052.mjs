import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/attribution-incrementality-sample.test.mjs"],
  { cwd: process.cwd(), stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  "Fase 52 validada: atribuição, incrementalidade e suficiência de amostra aparecem separadas e sem causalidade inventada.",
);
