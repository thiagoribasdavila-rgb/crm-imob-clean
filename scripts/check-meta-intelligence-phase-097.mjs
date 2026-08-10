import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-memory-publication-template.json", "scripts/preflight-meta-memory-publication.mjs", "docs/META_MEMORY_PUBLICATION_PHASE_97.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-memory-publication.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_MEMORY_PUBLICATION_PHASE_97.md`, "utf8");
const markers = ["validateMetaMemoryPublication", "independent_review_required", "publication_boundary_invalid", "meta_memory_publication_valid_copilot_only", "selfTestMetaMemoryPublication"];
const docMarkers = ["revisão independente", "não pode aprová-la", "nunca automações", "dados de clientes"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-memory-publication.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 97: aprovada — memoria revisada de forma independente e limitada ao Copilot.");
