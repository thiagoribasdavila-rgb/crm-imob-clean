import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, "config", "api-security-contract.json"), "utf8"));
const normalize = (value) => value.split(path.sep).join("/");
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const routes = walk(path.join(root, "app", "api"))
  .filter((file) => file.endsWith(`${path.sep}route.ts`))
  .map((file) => normalize(path.relative(root, file)))
  .sort();
const publicRoutes = new Set(contract.publicRoutes);
const authFlows = new Set(contract.authFlowRoutes);
const webhooks = new Set(contract.webhookRoutes);
const workers = new Set(contract.workerRoutes);
const noBodyMutations = new Set(contract.noBodyMutationRoutes);
const failures = [];
let protectedCount = 0;

for (const route of routes) {
  const source = fs.readFileSync(path.join(root, route), "utf8");
  if (publicRoutes.has(route)) continue;
  if (authFlows.has(route)) {
    if (!/rate.?limit|enforceRateLimit|checkRateLimit/i.test(source)) failures.push(`${route}: fluxo de autenticação sem limite`);
    continue;
  }
  if (webhooks.has(route)) {
    if (!/verifyWebhookSignature/.test(source) || !/checkRateLimit/.test(source)) failures.push(`${route}: webhook sem assinatura ou limite`);
    continue;
  }
  if (workers.has(route)) {
    if (!/ATLAS_CRON_SECRET/.test(source)) failures.push(`${route}: worker sem segredo operacional`);
    continue;
  }
  if (!contract.authenticationEvidence.some((token) => source.includes(token)) && !source.includes("@/app/api/v1/leads/route")) {
    failures.push(`${route}: sessão/identidade não comprovada`);
  } else protectedCount += 1;

  const mutates = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/.test(source);
  if (mutates && !noBodyMutations.has(route) && !contract.validationEvidence.some((token) => source.includes(token))) failures.push(`${route}: mutação sem leitura validável de entrada`);
}

for (const expected of [...publicRoutes, ...authFlows, ...webhooks, ...workers]) {
  if (!routes.includes(expected)) failures.push(`${expected}: exceção declarada não existe`);
}
for (const route of noBodyMutations) {
  if (!routes.includes(route)) failures.push(`${route}: exceção sem corpo não existe`);
  else if (!/export\s+async\s+function\s+POST/.test(fs.readFileSync(path.join(root, route), "utf8"))) failures.push(`${route}: exceção sem corpo não é POST`);
}

const legacyAuth = fs.readFileSync(path.join(root, "lib/security/api-auth.ts"), "utf8");
const accessContext = fs.readFileSync(path.join(root, "lib/api/security.ts"), "utf8");
for (const evidence of ["profiles", "organizations", "profile.active", "organization.active", "api.access_granted", "api.access_denied"]) {
  if (!legacyAuth.includes(evidence)) failures.push(`autenticador canônico: falta ${evidence}`);
}
if (legacyAuth.includes("service_role")) failures.push("autenticador de usuário não pode usar service role");
for (const evidence of ["api.access_granted", "api.access_denied", "organizationId", "role"] ) {
  if (!accessContext.includes(evidence)) failures.push(`contexto de acesso: auditoria sem ${evidence}`);
}

if (failures.length) {
  console.error(`API Fase ${contract.phase}: falhou\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`API Fase ${contract.phase}: aprovado — ${routes.length} rotas classificadas; ${protectedCount} rotas autenticadas; ${publicRoutes.size} públicas; ${authFlows.size} de autenticação; ${webhooks.size} webhooks; ${workers.size} workers.`);
