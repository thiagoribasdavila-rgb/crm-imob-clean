import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/kanban-unified-movement.test.mjs"],
  { stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  "Fase 36 validada: todos os caminhos do Kanban usam um contrato único de movimento.",
);
