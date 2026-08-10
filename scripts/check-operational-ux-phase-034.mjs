import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/kanban-essential-decision-card.test.mjs"],
  { stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  "Fase 34 validada: cards essenciais preservam decisão e profundidade sob demanda.",
);
