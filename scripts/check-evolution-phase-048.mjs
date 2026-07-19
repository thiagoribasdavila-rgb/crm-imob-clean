import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-048-operational-access-readiness.json", "utf8"));
const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
const guard = fs.readFileSync("components/SupabaseGuard.tsx", "utf8");
const shell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const security = fs.readFileSync("lib/api/security.ts", "utf8");
const context = fs.readFileSync("lib/auth/atlas-auth-context.ts", "utf8");
const login = fs.readFileSync("app/(auth)/login/page.tsx", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_048_OPERATIONAL_ACCESS_READINESS.md", "utf8");

const checks = [
  ["Fase 048 concluída sem tocar dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Programa preserva as 3.000 fases como referência sem limitar a evolução", program.referenceBacklogPhases === 3000 && program.horizon === "continuous" && program.deliveryCadence === "one-phase-per-day" && program.truthPolicy.plannedWorkCountsAsProgress === false],
  ["ZIP permanece condicionado aos gates de release", program.releasePolicy.mode === "release-gated" && program.releasePolicy.automaticCheckpointPackages === false && config.release.zipCreated === false],
  ["Guard usa o contexto oficial do servidor", guard.includes("fetchAtlasAuthContext") && guard.includes('response.status === 401 || response.status === 403')],
  ["Guard não autoriza por sessão bruta ou profiles no navegador", !guard.includes("getSession(") && !guard.includes('.from("profiles")')],
  ["Falha temporária preserva a sessão", guard.includes('setState("recoverable-error")') && guard.includes("Sua sessão foi preservada")],
  ["Shell não replica consultas de perfil e organização", shell.includes("readAtlasAuthContext") && !shell.includes('.from("profiles")') && !shell.includes('.from("organizations")')],
  ["API oficial fornece nome, organização e RBAC", security.includes("name: string") && security.includes("profileRecord.full_name") && security.includes("organizationId") && security.includes("accessRole")],
  ["Login grava apenas contexto validado", login.includes("parseAtlasAuthContext") && login.includes("storeAtlasAuthContext")],
  ["Gerente e superintendente recebem rótulo correto", topbar.includes('identity.role === "manager"') && topbar.includes('identity.role === "superintendent"')],
  ["Logout elimina os caches de autorização", topbar.includes("clearAtlasAuthContext") && context.includes('removeItem("atlas:shell-identity")')],
  ["Relatório registra risco externo e próxima fase", report.includes("login real com as quatro contas") && config.nextPhase.phase === 49],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 048 verificada: acesso operacional usa uma única fonte oficial e o release continua governado.");
