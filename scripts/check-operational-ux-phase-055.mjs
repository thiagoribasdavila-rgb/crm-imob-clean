import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--test", "tests/contracts/human-decision-learning-ledger.test.mjs"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Fase 55 validada: decisão humana, responsável, prazo e resultado observado fecham o livro executivo sem ação autônoma.");
