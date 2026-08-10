import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/kanban-adaptive-empty-stages.test.mjs"],
  { stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  "Fase 38 validada: colunas vazias ocupam menos espaço e se expandem no momento da movimentação.",
);
