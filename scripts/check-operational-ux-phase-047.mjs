import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/lead360-prioritized-timeline.test.mjs"],
  { cwd: process.cwd(), stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  "Fase 47 validada: atrasos, próximos compromissos e contexto recente aparecem antes do histórico complementar.",
);
