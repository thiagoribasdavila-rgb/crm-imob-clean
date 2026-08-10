import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "tests/contracts/local-instant-loading.test.mjs"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Fase 57 validada: shell persistente e fallbacks locais contextualizados nas rotas operacionais críticas.");
