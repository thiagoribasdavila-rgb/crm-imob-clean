import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, "config", "abuse-protection.json"), "utf8"));
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260717075224_phase_19_abuse_protection.sql"), "utf8");
const failures = [];

for (const control of contract.databaseControls) if (!migration.includes(control)) failures.push(`banco sem ${control}`);
for (const route of contract.distributedRateLimitedRoutes) {
  const source = fs.readFileSync(path.join(root, route), "utf8");
  if (!source.includes("enforceDistributedRateLimit")) failures.push(`${route}: limite não distribuído`);
}
for (const route of contract.signedWebhooks) {
  const source = fs.readFileSync(path.join(root, route), "utf8");
  if (!source.includes("verifyWebhookSignature") || !source.includes("request.text()")) failures.push(`${route}: assinatura não usa corpo bruto`);
  if (!source.includes('code === "23505"')) failures.push(`${route}: duplicidade não tratada`);
}
for (const route of contract.idempotentRoutes) {
  const source = fs.readFileSync(path.join(root, route), "utf8");
  for (const evidence of ["claimIdempotency", "completeIdempotency", "idempotency-key", "requestFingerprint"]) {
    if (!source.toLowerCase().includes(evidence.toLowerCase())) failures.push(`${route}: falta ${evidence}`);
  }
}
for (const evidence of ["security definer", "set search_path = ''", "grant execute", "to service_role", "revoke all"]) {
  if (!migration.toLowerCase().includes(evidence)) failures.push(`funções privilegiadas sem ${evidence}`);
}

if (failures.length) {
  console.error(`ABUSE Fase ${contract.phase}: falhou\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`ABUSE Fase ${contract.phase}: aprovado — ${contract.distributedRateLimitedRoutes.length} limites distribuídos; ${contract.signedWebhooks.length} webhooks assinados e deduplicados; ${contract.idempotentRoutes.length} comando externo idempotente; ${contract.databaseControls.length} controles no banco.`);
