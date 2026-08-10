import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "tests/contracts/real-scenario-validation.test.mjs"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Fase 58 validada: cenário usa fonte real, premissa explícita, base congelada e comparação posterior supervisionada.");
