import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const release = readFileSync("scripts/release-atlas-ai-os.mjs", "utf8");
const readiness = readFileSync("scripts/preflight-atlas-real-use-readiness-decision.mjs", "utf8");
const gates = JSON.parse(readFileSync("config/atlas-ai-os-release-gates.json", "utf8"));
const doc = readFileSync("docs/RELEASE_GATE_LINK_PHASE_53.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };

for (const marker of ["ATLAS_READINESS_DECISION_FILE", "Recibo de prontidão ausente", "validateRealUseReadinessDecision", "Recibo de prontidão inválido", "run(\"npm\", [\"run\", \"build\"])" ]) expect(release.includes(marker), `vinculo ausente: ${marker}`);
expect(release.indexOf("Recibo de prontidão ausente") < release.indexOf("run(\"npm\", [\"run\", \"build\"])"), "build pode ocorrer antes do recibo");
expect(readiness.includes("execution_must_remain_blocked_until_release_gate"), "recibo permite execucao antecipada");
expect(gates.status === "blocked" && gates.approved === false && Object.values(gates.gates).some((value) => value === false), "release foi liberada sem evidencia independente");
for (const marker of ["não acessa banco", "não cria ZIP", "não executa build", "não publica", "oito gates"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-atlas-real-use-readiness-decision.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste de prontidao reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 53: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 53: aprovada — ZIP final condicionado a recibo humano validado e aos gates independentes, antes do unico build.");
