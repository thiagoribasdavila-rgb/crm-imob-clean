import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-37-card-inventory.json";
const SOURCE_ROOTS = ["app", "components"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

function collectSourceFiles(root) {
  const files = [];

  function visit(absoluteDirectory) {
    if (!fs.existsSync(absoluteDirectory)) return;
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolutePath);
    }
  }

  for (const sourceRoot of SOURCE_ROOTS) visit(path.join(root, sourceRoot));
  return files;
}

function findExternalReferences(root, candidate, sourceFiles) {
  if (!candidate.referenceNeedles?.length) return [];
  const candidatePath = path.resolve(root, candidate.file);
  const references = [];

  for (const absolutePath of sourceFiles) {
    if (path.resolve(absolutePath) === candidatePath) continue;
    const content = fs.readFileSync(absolutePath, "utf8");
    if (candidate.referenceNeedles.some((needle) => content.includes(needle))) {
      references.push(path.relative(root, absolutePath));
    }
  }

  return references.sort();
}

export function loadRegistry(root = process.cwd(), registryPath = DEFAULT_REGISTRY) {
  return JSON.parse(readText(root, registryPath));
}

export function validateCardInventory({ root = process.cwd(), registry }) {
  assert(registry.phase === 37, "O inventário precisa representar a Fase 37.");
  assert(registry.status === "inventory-only", "A Fase 37 deve permanecer inventory-only.");
  assert(registry.runtimeMutationAllowed === false, "A Fase 37 não autoriza mutação de runtime.");
  assert(registry.databaseMutationAllowed === false, "A Fase 37 não autoriza mutação de banco.");
  assert(registry.canonicalPrimitives?.length >= 2, "Primitivas canônicas insuficientes.");
  assert(registry.criticalSurfaces?.length >= 4, "Superfícies críticas insuficientes.");
  assert(registry.legacyCandidates?.length >= 3, "Candidatos legados insuficientes.");

  const primitiveIds = new Set();
  for (const primitive of registry.canonicalPrimitives) {
    assert(!primitiveIds.has(primitive.id), `Primitiva duplicada: ${primitive.id}`);
    primitiveIds.add(primitive.id);
    assert(["canonical", "canonical-adapter"].includes(primitive.status), `Status canônico inválido: ${primitive.id}`);
    const source = readText(root, primitive.file);
    for (const marker of primitive.requiredMarkers) {
      assert(source.includes(marker), `Marcador ausente em ${primitive.file}: ${marker}`);
    }
    for (const exportedName of primitive.exports) {
      assert(source.includes(exportedName), `Exportação inventariada não encontrada em ${primitive.file}: ${exportedName}`);
    }
  }

  const surfaceIds = new Set();
  const routes = new Set();
  for (const surface of registry.criticalSurfaces) {
    assert(!surfaceIds.has(surface.id), `Superfície duplicada: ${surface.id}`);
    assert(!routes.has(surface.route), `Rota crítica duplicada: ${surface.route}`);
    surfaceIds.add(surface.id);
    routes.add(surface.route);
    assert(surface.status === "operational", `Superfície não operacional: ${surface.id}`);
    assert(surface.source !== "app/(atlas)/dashboard/page.tsx", "O dashboard fixo não pode ser superfície canônica.");
    assert(surface.roles?.length > 0, `Papéis ausentes: ${surface.id}`);
    assert(surface.dataSources?.length > 0, `Fontes de dados ausentes: ${surface.id}`);
    assert(surface.decisionPurpose?.trim(), `Propósito decisório ausente: ${surface.id}`);
    const source = readText(root, surface.source);
    for (const marker of surface.requiredMarkers) {
      assert(source.includes(marker), `Marcador operacional ausente em ${surface.source}: ${marker}`);
    }
  }

  const sourceFiles = collectSourceFiles(root);
  const legacyReferences = {};
  for (const candidate of registry.legacyCandidates) {
    const source = readText(root, candidate.file);
    for (const marker of candidate.requiredMarkers) {
      assert(source.includes(marker), `Evidência legada ausente em ${candidate.file}: ${marker}`);
    }
    const references = findExternalReferences(root, candidate, sourceFiles);
    legacyReferences[candidate.id] = references;
    assert(
      references.length === candidate.expectedExternalReferences,
      `Referências externas inesperadas em ${candidate.id}: esperadas ${candidate.expectedExternalReferences}, encontradas ${references.length} (${references.join(", ") || "nenhuma"}).`,
    );
  }

  assert(registry.acceptanceCriteria?.length >= 5, "Critérios de aceite insuficientes.");

  return {
    phase: registry.phase,
    ok: true,
    canonicalPrimitives: registry.canonicalPrimitives.length,
    operationalSurfaces: registry.criticalSurfaces.length,
    legacyCandidates: registry.legacyCandidates.length,
    legacyReferences,
    runtimeMutationAllowed: registry.runtimeMutationAllowed,
    databaseMutationAllowed: registry.databaseMutationAllowed,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadRegistry(root, registryPath);
  const summary = validateCardInventory({ root, registry });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Fase 37 inválida: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
