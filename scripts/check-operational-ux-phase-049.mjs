import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/contracts/lead360-single-decision-flow.test.mjs"],
  { cwd: process.cwd(), stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  "Fase 49 validada: perfil, evidências e rotina têm responsabilidades únicas sem perder a recomendação canônica.",
);
