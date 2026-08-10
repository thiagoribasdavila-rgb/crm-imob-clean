import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/compact-project-library.test.mjs"],
  { stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log("Fase 28 validada: biblioteca operacional compacta por projeto.");
