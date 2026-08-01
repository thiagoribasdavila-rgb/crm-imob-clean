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
const bridges = new Set(contract.bridgeRoutes ?? []);
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
  if (bridges.has(route)) {
    // ── PONTE DO WHATSAPP: MÁQUINA-A-MÁQUINA ─────────────────────────────────
    //
    // Estas rotas são chamadas pelo processo do bridge (PM2), não por navegador.
    // Cobrar delas evidência de SESSÃO era a régua errada, e por isso as três
    // apareciam como "identidade não comprovada" — quando na verdade já exigiam
    // `x-atlas-bridge-secret` e devolviam 401. Medido em 2026-07-29.
    //
    // A exigência aqui é MAIS estrita que a genérica, não menos:
    if (!/x-atlas-bridge-secret/.test(source) || !/segredoConfere|segredoDaPonte/.test(source)) {
      failures.push(`${route}: ponte sem o segredo compartilhado`);
    }
    if (!/status:\s*401/.test(source)) failures.push(`${route}: ponte sem recusa 401`);
    // A terceira é a que importa: sem ela, alguém "consertaria" a ponte trocando
    // o segredo por sessão de usuário — e aí qualquer corretor logado poderia
    // perguntar "este telefone é uma lead?" e injetar mensagem de entrada.
    if (contract.authenticationEvidence.some((token) => source.includes(token))) {
      failures.push(`${route}: ponte aceitando sessão de usuário — ela é máquina-a-máquina`);
    }
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
// As pontes entram na CONTA porque o resumo é o que alguém lê para acreditar que
// as 194 rotas estão cobertas. Categoria que existe e não aparece no resumo é
// cobertura invisível — e este projeto já pagou por número que não fechava.
const classificadas = publicRoutes.size + authFlows.size + webhooks.size + workers.size + bridges.size + protectedCount;
console.log(`API Fase ${contract.phase}: aprovado — ${routes.length} rotas classificadas; ${protectedCount} rotas autenticadas; ${publicRoutes.size} públicas; ${authFlows.size} de autenticação; ${webhooks.size} webhooks; ${workers.size} workers; ${bridges.size} pontes máquina-a-máquina.`);
if (classificadas !== routes.length) {
  console.error(
    `\nATENÇÃO: as categorias somam ${classificadas} e existem ${routes.length} rotas. ` +
      "A diferença são rotas que passaram sem cair em categoria nenhuma — o resumo estaria mentindo.",
  );
  process.exit(1);
}
