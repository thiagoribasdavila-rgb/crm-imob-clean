import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/kanban-command-to-priority-flow.test.mjs"],
  { stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  "Fase 40 validada: comando e prioridade formam uma leitura contínua sem bloco intermediário repetido.",
);
