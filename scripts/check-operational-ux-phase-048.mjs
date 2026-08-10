import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/lead360-progressive-profile-edit.test.mjs"],
  { cwd: process.cwd(), stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  "Fase 48 validada: campos decisivos permanecem imediatos e dados complementares continuam editáveis sob demanda.",
);
