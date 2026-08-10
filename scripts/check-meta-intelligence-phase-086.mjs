import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-decision-impact-simulation-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-decision-impact-simulation.mjs", "utf8");
const doc = readFileSync("docs/META_DECISION_IMPACT_SIMULATION_PHASE_86.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_simulated" && template.scenario.isEstimate === true, "template apresenta simulacao como fato");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de simulacao incompletas");
for (const marker of ["validateMetaDecisionImpactSimulation", "low_confidence_impact_must_be_unknown", "external_change_observed", "meta_decision_impact_simulation_valid_estimate_only", "selfTestMetaDecisionImpactSimulation"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["Todo cenário é uma estimativa", "confiança baixa obriga impacto “desconhecido”", "não altera orçamento, público, campanha ou produção", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-decision-impact-simulation.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da simulacao reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 86: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 86: aprovada — simulacao de impacto estimada, transparente e sem alteracao automatica.");
