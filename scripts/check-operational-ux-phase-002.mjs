import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "config/operational-ux-phase-002-journeys.json");
const navigationPath = path.join(root, "components/atlas/navigation-performance.tsx");
const shellPath = path.join(root, "components/atlas/app-shell.tsx");
const endpointPath = path.join(root, "app/api/v3/events/ingest/route.ts");
const eventMigrationPath = path.join(root, "supabase/migrations/20260711150000_atlas_v3_unification.sql");
const grantMigrationPath = path.join(root, "supabase/migrations/20260723090000_explicit_data_api_grants.sql");
const measurementPath = path.join(root, "scripts/measure-operational-ux-phase-002.mjs");
const documentationPath = path.join(root, "docs/ATLAS_ONE_UX_PHASE_002_JOURNEY_MEASUREMENT.md");

let failures = 0;
function assert(condition, message) {
  if (condition) console.log(`PASS: ${message}`);
  else {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

for (const file of [
  configPath,
  navigationPath,
  shellPath,
  endpointPath,
  eventMigrationPath,
  grantMigrationPath,
  measurementPath,
  documentationPath,
]) {
  assert(fs.existsSync(file), `artefato existe: ${path.relative(root, file)}`);
}

if (failures) process.exit(1);

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const navigation = fs.readFileSync(navigationPath, "utf8");
const shell = fs.readFileSync(shellPath, "utf8");
const endpoint = fs.readFileSync(endpointPath, "utf8");
const eventMigration = fs.readFileSync(eventMigrationPath, "utf8").toLowerCase();
const grantMigration = fs.readFileSync(grantMigrationPath, "utf8").toLowerCase();
const measurement = fs.readFileSync(measurementPath, "utf8");
const documentation = fs.readFileSync(documentationPath, "utf8").toLowerCase();

assert(config.phase === "operational-ux-002", "identificador da Fase 2 é estável");
assert(config.status === "instrumented-awaiting-real-sample", "estado diferencia instrumentação de amostra real");
assert(config.timeZone === "America/Sao_Paulo", "fuso operacional permanece explícito");
assert(Array.isArray(config.journeys) && config.journeys.length === 6, "seis jornadas críticas estão contratadas");
assert(config.journeys.every((journey) => journey.maximumClicks <= 3), "todas as jornadas respeitam meta máxima de três cliques");
assert(config.journeys.every((journey) => journey.startRoute && journey.endRoute), "todas as jornadas declaram início e destino");
assert(new Set(config.journeys.flatMap((journey) => journey.roles)).size === 4, "corretor, gerente, superintendente e diretor estão cobertos");
assert(config.runtimeBaseline?.sampledEvents === null, "amostra ausente não foi convertida em valor fictício");
assert(config.runtimeBaseline?.completionRate === null, "taxa de conclusão permanece desconhecida sem uso real");

for (const eventName of [
  "atlas.page_viewed",
  "atlas.navigation_completed",
  "atlas.route_session_completed",
]) {
  assert(navigation.includes(eventName), `cliente registra ${eventName}`);
}
for (const signal of [
  "clickCount",
  "internalNavigationCount",
  "submitIntentCount",
  "controlCounts",
  "durationClamped",
]) {
  assert(navigation.includes(signal), `sessão agrega ${signal}`);
}
assert(navigation.includes('navigator.doNotTrack === "1"'), "preferência Do Not Track é respeitada");
assert(navigation.includes("normalizeRoute"), "rota dinâmica é normalizada antes do registro");
assert(!/innerText|textContent|\.value\b|formData|searchParams/.test(navigation), "texto, valor digitado e query string não são capturados");
assert(shell.includes('<NavigationPerformance role={identity.email ? identity.role : "unknown"} />'), "papel comercial é enviado sem identidade pessoal");

assert(endpoint.includes("requireApiIdentity(request)"), "ingestão exige identidade autenticada");
assert(endpoint.includes("organization_id: identity.organizationId"), "organização é resolvida exclusivamente no servidor");
assert(endpoint.includes("checkRateLimit"), "endpoint possui limitação de chamadas");
assert(eventMigration.includes("alter table public.atlas_events enable row level security"), "ledger de eventos possui RLS");
assert(eventMigration.includes('create policy "tenant atlas events"'), "ledger possui política tenant");
assert(grantMigration.includes("public.atlas_events"), "grants explícitos incluem o ledger");
assert(grantMigration.includes("to service_role"), "gravação administrativa permanece no servidor");

assert(measurement.includes("awaiting-real-sample"), "medidor preserva o estado sem amostra");
assert(measurement.includes("completionRate: null"), "medidor não inventa conclusão para fluxo sem prova");
assert(documentation.includes("nenhuma métrica foi estimada"), "documentação declara a ausência de estimativa");
assert(documentation.includes("evento de domínio"), "limite entre interação e resultado comercial está documentado");

if (failures) {
  console.error(`\nFase 2 reprovada: ${failures} contrato(s) divergente(s).`);
  process.exit(1);
}

console.log("\nFase 2 aprovada: jornadas instrumentadas, privacidade preservada e amostra real ainda explicitamente pendente.");
