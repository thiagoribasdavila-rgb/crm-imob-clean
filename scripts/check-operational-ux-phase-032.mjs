import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/kanban-single-priority-queue.test.mjs"],
  { stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Fase 32 validada: uma única fila curta ordena até três decisões.");
