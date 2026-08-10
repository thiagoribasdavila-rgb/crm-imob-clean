import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "tests/contracts/operational-ux-release-gate.test.mjs"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Fase 60 validada: redesign governado por evidência, aceite da Diretoria e rollback.");
