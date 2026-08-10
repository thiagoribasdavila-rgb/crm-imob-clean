import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "tests/contracts/forecast-snapshot-measurement.test.mjs"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Fase 56 validada: forecast congelado, resultado observado e tendência condicionada a janelas comparáveis.");
