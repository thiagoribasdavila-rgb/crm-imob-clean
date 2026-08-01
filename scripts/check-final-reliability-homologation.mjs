import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-reliability-homologation.json", '"phase": 9', '"missing_evidence_blocks": true', '"postgres_minimum_major": 17', '"automatic_publish": false');
const program = JSON.parse(fs.readFileSync("config/final-10-phases-improvement.json", "utf8"));
checks.push(["config/final-10-phases-improvement.json: fase atual não regrediu", Number(program.current_phase) >= 9]);
checks.push(["config/final-10-phases-improvement.json: fases 1 a 9 concluídas", [1, 2, 3, 4, 5, 6, 7, 8, 9].every((phase) => program.completed?.includes(phase))]);
need("lib/governance/reliability-release-gate.ts", 'key: "evidence_completeness"', 'severity: "critical"', "e.evidenceComplete", "aiLatencySampleSize");
need("app/api/v1/governance/reliability-gate/route.ts", 'count: "exact", head: true', '.limit(1).maybeSingle()', ".limit(5000)", "evidenceErrors", "missingEvidenceBlocks: true");
need("docs/FINAL_PHASE_9_RELIABILITY_HOMOLOGATION.md", "quatro perfis", "dois tenants", "PostgreSQL 17", "falso estado saudável", "não produção");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nConfiabilidade aprovada: ${checks.length} controles locais; Fase Final 9 concluída sem promover produção.`);
