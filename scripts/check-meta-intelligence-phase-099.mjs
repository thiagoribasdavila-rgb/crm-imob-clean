import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-operational-readiness-template.json", "scripts/preflight-meta-operational-readiness.mjs", "docs/META_OPERATIONAL_READINESS_PHASE_99.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-operational-readiness.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_OPERATIONAL_READINESS_PHASE_99.md`, "utf8");
const markers = ["validateMetaOperationalReadiness", "governance_controls_incomplete", "real_operational_evidence_incomplete", "meta_operational_readiness_real_evidence_complete", "selfTestMetaOperationalReadiness"];
const docMarkers = ["gate único", "produção continua bloqueada", "teste completo de entrada e retorno de lead", "Evidência ausente nunca é presumida"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-operational-readiness.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 99: aprovada — homologacao governada e producao bloqueada ate evidencia operacional real.");
