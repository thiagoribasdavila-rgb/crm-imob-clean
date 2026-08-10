import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/meta-capi-failure-queue.test.mjs"],
  { cwd: process.cwd(), stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  "Fase 53 validada: falhas Meta/CAPI e dead letters formam uma fila operacional sanitizada, supervisionada e acionável.",
);
