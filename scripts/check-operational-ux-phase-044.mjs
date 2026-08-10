import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/kanban-header-card-continuity.test.mjs"],
  { cwd: process.cwd(), stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  "Fase 44 validada: cabeçalho e primeiro lead formam uma sequência contínua e prioritária.",
);
