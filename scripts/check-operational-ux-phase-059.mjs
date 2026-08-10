import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "tests/contracts/operational-ux-before-after.test.mjs"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Fase 59 validada: eficiência antes/depois medida sem alegação causal e com qualidade humana.");
