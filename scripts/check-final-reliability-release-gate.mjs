import fs from "node:fs";
const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};
need("lib/governance/reliability-release-gate.ts", 'key: "evidence_completeness"', "e.databaseLatencyMs <= 500", "e.oldestPendingMinutes <= 15", "e.aiP95LatencyMs <= 15000", '"ready_for_homologation"', "automaticPublish: false");
need("supabase/migrations/20260719203000_phase_98_reliability_release_gate.sql", "integration_outbox_org_status_available_idx", "ai_usage_org_created_latency_idx", "reliability_release_snapshots", "snapshot_hash");
need("app/api/v1/governance/reliability-gate/route.ts", "rawLogsReturned: false", "secretsReturned: false", "humanReleaseApprovalRequired: true", "missingEvidenceBlocks: true", "duplicatePrevented", "productionPublished: false");
need("app/(crm)/atlas-v3/reliability/page.tsx", "98-final-reliability-release-gate", "SEGURANÇA · DESEMPENHO · OBSERVABILIDADE", "Publicação bloqueada", "nenhuma publicação foi executada");
need("config/final-reliability-release-gate.json", '"phase":98', '"missing_evidence_blocks":true', '"automatic_publish":false', '"human_release_approval_required":true');
for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nFase 98 aprovada: ${checks.length} controles de confiabilidade final.`);
