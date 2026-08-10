import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const baselinePath = path.join(
  root,
  "config/operational-ux-phase-001-baseline.json",
);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, output);
    else output.push(absolute);
  }
  return output;
}

function routeForPage(file) {
  const relative = path
    .relative(path.join(root, "app"), file)
    .replaceAll(path.sep, "/")
    .replace(/\/page\.tsx$/, "");
  const segments = relative
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\(.*\)$/.test(segment));
  return `/${segments.join("/")}`;
}

assert(fs.existsSync(baselinePath), "baseline da Fase 1 existe");
if (!fs.existsSync(baselinePath)) process.exit(1);

const baseline = readJson(baselinePath);
const navigationSource = path.join(root, baseline.navigationSource ?? "");
const navigationCode = fs.existsSync(navigationSource)
  ? fs.readFileSync(navigationSource, "utf8")
  : "";
const pageFiles = walk(path.join(root, "app"))
  .filter((file) => file.endsWith(`${path.sep}page.tsx`))
  .map((file) => path.relative(root, file).replaceAll(path.sep, "/"));
const pagesByRoute = new Map();

for (const file of pageFiles) {
  const route = routeForPage(path.join(root, file));
  const files = pagesByRoute.get(route) ?? [];
  files.push(file);
  pagesByRoute.set(route, files);
}

assert(baseline.phase === "operational-ux-001", "identificador da fase é estável");
assert(/^1\./.test(baseline.schemaVersion ?? ""), "schema do baseline possui versão explícita");
assert(baseline.timeZone === "America/Sao_Paulo", "fuso operacional está congelado");
assert(fs.existsSync(navigationSource), "fonte canônica de navegação existe");
assert(
  Array.isArray(baseline.canonicalRoutes) && baseline.canonicalRoutes.length === 19,
  "19 destinos canônicos foram congelados",
);

const routeIds = new Set();
const routeHrefs = new Set();
for (const route of baseline.canonicalRoutes ?? []) {
  assert(Boolean(route.id && route.label && route.href), `contrato básico da rota ${route.id ?? "sem id"}`);
  assert(!routeIds.has(route.id), `id de rota único: ${route.id}`);
  assert(!routeHrefs.has(route.href), `href canônico único: ${route.href}`);
  routeIds.add(route.id);
  routeHrefs.add(route.href);

  const sourcePair = new RegExp(
    `id:\\s*["']${route.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][\\s\\S]{0,220}?href:\\s*["']${route.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
  );
  assert(sourcePair.test(navigationCode), `rota ${route.id} permanece na navegação canônica`);

  const actual = [...(pagesByRoute.get(route.href) ?? [])].sort();
  const expected = [...(route.routeFiles ?? [])].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `arquivos físicos de ${route.href} correspondem ao baseline`,
  );
  const expectedStatus = actual.length === 1 ? "single" : actual.length > 1 ? "collision" : "missing";
  assert(route.status === expectedStatus, `estado físico de ${route.href}: ${expectedStatus}`);
  for (const file of expected) {
    assert(fs.existsSync(path.join(root, file)), `arquivo de rota existe: ${file}`);
  }
}

const canonicalCollisions = (baseline.canonicalRoutes ?? [])
  .filter((route) => route.status === "collision")
  .map((route) => route.href)
  .sort();
assert(
  JSON.stringify(canonicalCollisions) ===
    JSON.stringify(["/ai-dashboard", "/dashboard", "/revenue-engine", "/sales"]),
  "quatro colisões canônicas conhecidas permanecem explicitamente registradas",
);

const metricIds = new Set();
const requiredMetricFields = [
  "id",
  "label",
  "surface",
  "formula",
  "amountBasis",
  "source",
  "api",
  "implementation",
  "period",
  "freshness",
  "coverage",
  "movementPolicy",
  "knownGap",
];
for (const metric of baseline.metricContracts ?? []) {
  assert(!metricIds.has(metric.id), `id de métrica único: ${metric.id}`);
  metricIds.add(metric.id);
  for (const field of requiredMetricFields) {
    const value = metric[field];
    assert(
      Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0,
      `métrica ${metric.id} declara ${field}`,
    );
  }
  assert(fs.existsSync(path.join(root, metric.api)), `API da métrica ${metric.id} existe`);
  assert(
    fs.existsSync(path.join(root, metric.implementation)),
    `implementação da métrica ${metric.id} existe`,
  );
}
assert(metricIds.size >= 15, "pelo menos 15 contratos críticos de métrica estão congelados");

const invariantIds = new Set((baseline.invariants ?? []).map((item) => item.id));
for (const required of [
  "tenant_and_hierarchy_scope",
  "imports_are_not_daily_intake",
  "no_movement_without_snapshot",
  "forecast_is_not_revenue",
  "no_accuracy_without_outcome",
  "attribution_is_not_incrementality",
  "zero_requires_measured_source",
  "human_approval_for_sensitive_actions",
  "canonical_route_requires_contract",
  "contract_change_requires_version",
]) {
  assert(invariantIds.has(required), `invariante obrigatória registrada: ${required}`);
}

assert(
  baseline.observedDataSnapshot?.status === "recorded-not-requeried",
  "snapshot factual diferencia registro histórico de nova consulta",
);
assert(
  Array.isArray(baseline.observedDataSnapshot?.items) &&
    baseline.observedDataSnapshot.items.length >= 5,
  "snapshot de planejamento preserva as evidências operacionais existentes",
);

const riskIds = new Set((baseline.knownRisks ?? []).map((risk) => risk.id));
assert(riskIds.has("canonical_route_collisions"), "risco de colisão de rotas está explícito");
assert(riskIds.has("forecast_method_drift"), "risco de divergência do forecast está explícito");
assert(
  riskIds.has("daily_intake_import_contamination"),
  "risco de importação contaminar entrada diária está explícito",
);

if (process.exitCode) {
  console.error("\nFase 1 reprovada: o contrato atual divergiu do baseline.");
  process.exit(process.exitCode);
}

console.log(
  `\nFase 1 aprovada: ${routeIds.size} rotas, ${metricIds.size} métricas e ${invariantIds.size} invariantes verificadas.`,
);
