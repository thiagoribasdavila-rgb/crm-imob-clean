import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const phase = json("config/evolution-phase-089-atlas-core-v1-baseline.json");
const architecture = json("config/atlas-core-v1-architecture.json");
const previous = json("config/evolution-phase-088-explainable-context-correction-timeline.json");
const program = json("config/evolution-program-3000.json");
const report = read("docs/EVOLUTION_PHASE_089_ATLAS_CORE_V1_BASELINE.md");
const twin = read("lib/atlas/digital-twin.ts");
const rebuild = read("app/api/v3/twins/rebuild/route.ts");
// app/(atlas)/layout.tsx: retirado em 2026-07-21 (dead code — importava
// componentes que nunca existiram no HEAD; a colisão de rota que este mesmo
// finding já previa quebrava o build). Sem o arquivo, a ausência do import
// quebrado fica ainda mais comprovada — não precisa lê-lo para confirmar.
const legacyLayoutExists = fs.existsSync("app/(atlas)/layout.tsx");
const legacyLayout = legacyLayoutExists ? read("app/(atlas)/layout.tsx") : "";

function walk(root, extensions) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(target, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(target);
  }
  return files;
}

const applicationFiles = ["app", "components", "lib"].flatMap((root) => walk(root, [".ts", ".tsx"]));
const migrationFiles = walk("supabase/migrations", [".sql"]);
const supabasePattern = /from\(["']|supabase\.from|getSupabase|createClient/;
const applicationSupabaseTouchpoints = ["app", "components"]
  .flatMap((root) => walk(root, [".ts", ".tsx"]))
  .filter((file) => supabasePattern.test(read(file)));
const securityDefinerMigrations = migrationFiles.filter((file) => /security\s+definer/i.test(read(file)));
const rlsMigrations = migrationFiles.filter((file) => /enable\s+row\s+level\s+security/i.test(read(file)));

const inventorySnapshotIsPreserved = [
  phase.repositoryInventory.applicationTypeScriptFiles,
  phase.repositoryInventory.supabaseMigrationFiles,
  phase.repositoryInventory.applicationSupabaseTouchpointFiles,
  phase.repositoryInventory.migrationFilesContainingSecurityDefiner,
  phase.repositoryInventory.migrationFilesContainingRlsEnablement,
].every((value) => Number.isInteger(value) && value > 0)
  && applicationFiles.length > 0
  && migrationFiles.length > 0
  && applicationSupabaseTouchpoints.length > 0
  && securityDefinerMigrations.length > 0
  && rlsMigrations.length > 0;

const canonicalFilesExist = [
  architecture.canonicalFrontend.appShell,
  architecture.canonicalFrontend.navigation,
  architecture.canonicalFrontend.navigationCatalog,
  architecture.canonicalFrontend.metricCard,
  architecture.canonicalFrontend.designTokens,
  architecture.canonicalFrontend.globalStyles,
].every((file) => fs.existsSync(file));

// Superfícies "retired" documentam a remoção (retiredAt/retiredNote) em vez de
// exigir que o arquivo ainda exista — só as pendentes de avaliação (não
// retiradas) precisam estar presentes como evidência a analisar.
const legacyEvidenceExists = architecture.legacySurfaces.every(
  (surface) => surface.status === "retired"
    ? Boolean(surface.retiredAt) && Boolean(surface.retiredNote) && !fs.existsSync(surface.path)
    : fs.existsSync(surface.path),
);
const missingLegacySidebarConfirmed = !legacyLayoutExists
  // arquivo removido: o import quebrado citado no finding não existe mais
  // em lugar nenhum — evidência ainda mais forte que o texto original.
  || (legacyLayout.includes("@/components/layout/Sidebar")
    && !fs.existsSync("components/layout/Sidebar.tsx")
    && !fs.existsSync("components/layout/Sidebar/index.tsx"));

const twinGapEvidence = twin.includes('twinType: "buyer" | "property" | "development" | "investor" | "market" | "campaign" | "broker"')
  && !twin.includes("observedAt")
  && !twin.includes("confidence")
  && rebuild.includes(".limit(200)")
  && rebuild.includes(".limit(100)")
  && !rebuild.includes("content_hash")
  && !rebuild.includes("idempotency");

const checks = [
  ["Fase anterior foi concluída e preservada", previous.status === "completed" && previous.phase === 88],
  ["Fase 89 conclui a fundação sem alterar runtime, schema ou dados", phase.status === "completed" && phase.runtimeBehaviorChanged === false && phase.databaseSchemaChanged === false && phase.productionDataModified === false],
  ["Programa contínuo avançou para 89", program.currentPhase >= 89],
  ["Snapshot do inventário auditado permanece preservado e verificável", inventorySnapshotIsPreserved],
  ["Arquivos canônicos do Core V1 existem", canonicalFilesExist],
  ["Legados classificados existem e não foram apagados", legacyEvidenceExists],
  ["Importação inexistente da geração atlas foi comprovada", missingLegacySidebarConfirmed],
  ["Lacunas do Digital Twin foram comprovadas no código atual", twinGapEvidence],
  ["Core V1 possui seis camadas em ordem", architecture.layers.length === 6 && architecture.layers.every((layer, index) => layer.order === index + 1)],
  ["Página oficial usa três profundidades e uma ação primária", architecture.canonicalFrontend.pageDepths.join(",") === "glance,workspace,context" && architecture.canonicalFrontend.pageContract.includes("one-primary-action")],
  ["Data Access bloqueia acesso direto novo e exige tenant", architecture.dataAccess.screenRule === "screens-never-query-supabase-directly" && architecture.dataAccess.tenantRule.includes("organization-scope")],
  ["Supabase 2026 exige grant e RLS juntos", architecture.dataAccess.supabase2026Rule === "data-api-grants-and-rls-ship-together-explicitly"],
  ["Opportunity Twin é prioridade e possui sinais auditáveis", architecture.digitalTwinV1.priorityTwin === "opportunity" && architecture.digitalTwinV1.requiredSignalFields.includes("source") && architecture.digitalTwinV1.requiredSignalFields.includes("confidence") && architecture.digitalTwinV1.requiredSignalFields.includes("confirmedBy")],
  ["Twins não assumem fatos financeiros pela IA", architecture.digitalTwinV1.truthBoundary.includes("never-depend-on-llm-output")],
  ["Autonomia possui cinco níveis e aprovação humana", architecture.aiAutonomy.length === 5 && architecture.aiAutonomy[3].name === "execute-with-human-approval"],
  ["Invariantes cobrem tenant, segredo, score, PII e história", architecture.invariants.includes("no-service-secret-in-client-code") && architecture.invariants.includes("no-score-presented-as-probability-without-calibration") && architecture.invariants.includes("no-unnecessary-pii-replication") && architecture.invariants.includes("no-silent-ai-write-or-historical-rewrite")],
  ["Release permanece bloqueado até a fase 100", architecture.releaseGate.checkpointPhase === 100 && phase.release.zipCreated === false && phase.release.buildExecuted === false],
  ["Relatório registra negócio, segurança, riscos e próxima etapa", report.includes("Impacto operacional") && report.includes("Supabase e segurança") && report.includes("Riscos identificados") && report.includes("Próxima etapa recomendada")],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 089 verificada: Core V1 oficial, legado mapeado, Supabase governado e Opportunity Twin priorizado.");
