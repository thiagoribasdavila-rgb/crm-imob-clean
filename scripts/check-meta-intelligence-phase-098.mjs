import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const required = ["config/fixtures/meta-copilot-memory-consumption-template.json", "scripts/preflight-meta-copilot-memory-consumption.mjs", "docs/META_COPILOT_MEMORY_CONSUMPTION_PHASE_98.md"];
const missing = required.filter((file) => !existsSync(`${root}/${file}`));
const script = missing.length ? "" : readFileSync(`${root}/scripts/preflight-meta-copilot-memory-consumption.mjs`, "utf8");
const doc = missing.length ? "" : readFileSync(`${root}/docs/META_COPILOT_MEMORY_CONSUMPTION_PHASE_98.md`, "utf8");
const markers = ["validateMetaCopilotMemoryConsumption", "memory_expired", "response_boundary_invalid", "meta_copilot_memory_consumption_valid_guidance_only", "selfTestMetaCopilotMemoryConsumption"];
const docMarkers = ["escopo solicitado coincide", "validade ainda está ativa", "nunca como fato comprovado", "não executa ações"];
const absent = [...markers.filter((marker) => !script.includes(marker)), ...docMarkers.filter((marker) => !doc.includes(marker))];
const test = missing.length || absent.length ? { status: 1 } : spawnSync(process.execPath, ["scripts/preflight-meta-copilot-memory-consumption.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
if (missing.length || absent.length || test.status !== 0) { console.error(JSON.stringify({ passed: false, missing, absent, output: test.stdout, error: test.stderr }, null, 2)); process.exit(1); }
console.log("META INTELLIGENCE Fase 98: aprovada — memoria usada pelo Copilot como orientacao rastreavel e sem automacao.");
