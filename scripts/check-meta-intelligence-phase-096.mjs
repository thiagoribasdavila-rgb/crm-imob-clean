import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-learning-memory-proposal-template.json", "scripts/preflight-meta-learning-memory-proposal.mjs", "docs/META_LEARNING_MEMORY_PROPOSAL_PHASE_96.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-learning-memory-proposal.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_LEARNING_MEMORY_PROPOSAL_PHASE_96.md`, "utf8");
const markers = ["validateMetaLearningMemoryProposal", "proposal_definition_invalid", "publication_boundary_invalid", "meta_learning_memory_proposal_valid_review_required", "selfTestMetaLearningMemoryProposal"];
const docMarkers = ["evidência corroborada", "proposta de memória comercial", "bloqueada para publicação", "dados de clientes"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-learning-memory-proposal.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 96: aprovada — memoria proposta com evidencia corroborada e publicacao bloqueada.");
