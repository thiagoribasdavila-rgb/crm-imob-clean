import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const configPath = "config/v3000-functional-parity.json";
const navigationPath = "lib/atlas/navigation.ts";
const outputPath = "docs/evidence/V3000_PHASE_380_FUNCTIONAL_PARITY.json";
const writeEvidence = process.argv.includes("--write");
const config = JSON.parse(readFileSync(resolve(root, configPath), "utf8"));
const navigationSource = readFileSync(resolve(root, navigationPath), "utf8");
const navigationBlock = navigationSource.match(
  /export const atlasNavigation\s*=\s*\[([\s\S]*?)\]\s*as const satisfies/,
)?.[1] ?? "";
const methodNames = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sourceAst(file, source) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasDefaultExport(file, source) {
  const ast = sourceAst(file, source);
  return ast.statements.some((statement) => {
    if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      return true;
    }
    return (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some((element) => element.name.text === "default")
    );
  });
}

function exportedMethods(file, source) {
  const ast = sourceAst(file, source);
  const names = new Set();
  for (const statement of ast.statements) {
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (exported && ts.isFunctionDeclaration(statement) && statement.name) {
      names.add(statement.name.text);
    }
    if (exported && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) names.add(element.name.text);
    }
  }
  return methodNames.filter((method) => names.has(method));
}

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/")
    ? resolve(root, specifier.slice(2))
    : resolve(root, dirname(fromFile), specifier);
  const candidates = extname(base)
    ? [base]
    : [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        resolve(base, "index.ts"),
        resolve(base, "index.tsx"),
        resolve(base, "index.js"),
        resolve(base, "index.jsx"),
      ];
  const found = candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  return found ? found.slice(root.length + 1) : null;
}

function localClosure(entry, limit = 180) {
  const queue = [entry];
  const seen = new Set();
  while (queue.length && seen.size < limit) {
    const file = queue.shift();
    if (
      !file ||
      seen.has(file) ||
      !existsSync(resolve(root, file)) ||
      !statSync(resolve(root, file)).isFile()
    ) {
      continue;
    }
    seen.add(file);
    const source = readFileSync(resolve(root, file), "utf8");
    const imports = [
      ...source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/g),
      ...source.matchAll(/import\s*["']([^"']+)["']/g),
    ].map((match) => match[1]);
    for (const specifier of imports) {
      const resolved = resolveLocalImport(file, specifier);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  const files = [...seen].sort();
  return {
    files,
    source: files.map((file) => readFileSync(resolve(root, file), "utf8")).join("\n"),
  };
}

function navigationEntries(source) {
  return [...source.matchAll(/id:\s*["']([^"']+)["'][\s\S]{0,500}?href:\s*["']([^"']+)["']/g)].map(
    ([, id, route]) => ({ id, route }),
  );
}

const navEntries = navigationEntries(navigationBlock);
const duplicateNavIds = navEntries
  .map(({ id }) => id)
  .filter((id, index, values) => values.indexOf(id) !== index);
const duplicateNavRoutes = navEntries
  .map(({ route }) => route)
  .filter((route, index, values) => values.indexOf(route) !== index);

const uiPatterns = {
  loading: /AtlasSkeleton|LoadingState|loading|isLoading|carregando/i,
  error: /AtlasRecoverableError|ErrorState|error|falha|indisponível|tentar novamente/i,
  empty: /AtlasEmpty|EmptyState|nenhum|nenhuma|sem dados|lista vazia/i,
};
const apiPatterns = {
  authentication: /requireApiIdentity|requireAccessContext|getApiContext|requirePageAccess|auth\.getUser|auth\.getSession/i,
  tenant: /organizationId|organization_id|access\.organization\.id/i,
  persistence: /\.from\s*\(|\.rpc\s*\(|getSupabaseAdmin|supabase/i,
  permissions: /accessRole|commercialRole|\brole\b|requireLeadAccess|FORBIDDEN|Permiss[aã]o/i,
};
const placeholderPattern = /\b(?:m[oó]dulo\s+em\s+breve|n[aã]o\s+implementado|not\s+implemented|TODO:\s*implementar)\b/i;
const externalTruthPattern = /PENDENTE|Conectar|Ainda sem teste real|AMBIENTE PRONTO|connectedRequiresVerifiedTest/i;

const modules = config.modules.map((module) => {
  const issues = [];
  const navMatches = navEntries.filter(
    ({ id, route }) => id === module.id && route === module.route,
  );
  const pageExists = existsSync(resolve(root, module.pageFile));
  const pageSource = pageExists ? readFileSync(resolve(root, module.pageFile), "utf8") : "";
  const pageClosure = pageExists ? localClosure(module.pageFile) : { files: [], source: "" };
  const apiExists = existsSync(resolve(root, module.api.file));
  const apiSource = apiExists ? readFileSync(resolve(root, module.api.file), "utf8") : "";
  const apiClosure = apiExists ? localClosure(module.api.file) : { files: [], source: "" };
  const methods = apiExists ? exportedMethods(module.api.file, apiSource) : [];
  const missingMethods = module.api.methods.filter((method) => !methods.includes(method));
  const ui = Object.fromEntries(
    Object.entries(uiPatterns).map(([name, pattern]) => [name, pattern.test(pageClosure.source)]),
  );
  const api = Object.fromEntries(
    Object.entries(apiPatterns).map(([name, pattern]) => [name, pattern.test(apiClosure.source)]),
  );
  const witnesses = module.witnesses.map((file) => ({
    file,
    exists: existsSync(resolve(root, file)),
  }));
  const placeholderFree = !placeholderPattern.test(pageClosure.source);
  const externalTruthful = !module.externalDependency || externalTruthPattern.test(pageClosure.source + apiClosure.source);

  if (navMatches.length !== 1) issues.push("navigation_contract");
  if (!pageExists) issues.push("page_missing");
  if (pageExists && pageSource.trim().length < 2_000) issues.push("page_too_small");
  if (pageExists && !hasDefaultExport(module.pageFile, pageSource)) issues.push("page_default_export");
  for (const [name, ok] of Object.entries(ui)) if (!ok) issues.push(`ui_${name}`);
  if (!placeholderFree) issues.push("placeholder_exposed");
  if (!apiExists) issues.push("api_missing");
  if (missingMethods.length) issues.push(`api_methods:${missingMethods.join(",")}`);
  for (const [name, ok] of Object.entries(api)) if (!ok) issues.push(`api_${name}`);
  if (witnesses.some(({ exists }) => !exists)) issues.push("witness_missing");
  if (!externalTruthful) issues.push("external_state_not_truthful");

  const contractProven = issues.length === 0;
  const status = contractProven
    ? module.externalDependency
      ? "CONNECT_REQUIRED"
      : "FUNCTIONAL_CONTRACT_PROVEN"
    : "PARTIAL_OR_BROKEN";
  if (status !== module.expectedStatus) issues.push(`unexpected_status:${status}`);

  return {
    id: module.id,
    route: module.route,
    frontend: {
      file: module.pageFile,
      exists: pageExists,
      nonTrivial: pageSource.trim().length >= 2_000,
      defaultExport: pageExists && hasDefaultExport(module.pageFile, pageSource),
      dependencyFiles: pageClosure.files.length,
      ui,
      placeholderFree,
    },
    api: {
      file: module.api.file,
      exists: apiExists,
      requiredMethods: module.api.methods,
      exportedMethods: methods,
      missingMethods,
      dependencyFiles: apiClosure.files.length,
      ...api,
    },
    permissions: {
      navigation: navMatches.length === 1,
      authenticated: api.authentication,
      tenantScoped: api.tenant,
      roleAware: api.permissions,
    },
    persistence: api.persistence,
    witnesses,
    externalDependency: Boolean(module.externalDependency),
    externalTruthful,
    status,
    issues,
  };
});

const statuses = modules.reduce((result, module) => {
  result[module.status] = (result[module.status] ?? 0) + 1;
  return result;
}, {});
const invalidModules = modules.filter((module) => module.issues.length > 0);
const expectedIds = config.modules.map(({ id }) => id).sort();
const actualIds = navEntries.map(({ id }) => id).sort();
const navigationExact =
  JSON.stringify(expectedIds) === JSON.stringify(actualIds) &&
  duplicateNavIds.length === 0 &&
  duplicateNavRoutes.length === 0;

const evidence = {
  schemaVersion: config.schemaVersion,
  phase: config.phase,
  consolidationGate: config.consolidationGate,
  generatedAt: new Date().toISOString(),
  scope: "canonical-navigation-functional-contracts",
  classification: {
    FUNCTIONAL_CONTRACT_PROVEN:
      "Página, API, persistência, autenticação, tenant, permissão, estados de UI e testemunha de teste possuem contrato estático rastreável.",
    CONNECT_REQUIRED:
      "Base interna comprovada; operação externa permanece explicitamente pendente até credencial e teste real no gate 9.",
    PARTIAL_OR_BROKEN:
      "Uma ou mais provas obrigatórias estão ausentes; o módulo não pode ser promovido como funcional.",
    caveat:
      "Esta fase não alega prova de runtime remoto. Sessão, organização, dados reais e integrações serão exercitados nos gates 8 e 9.",
  },
  sourceOfTruth: {
    configuration: configPath,
    navigation: navigationPath,
  },
  summary: {
    canonicalModules: modules.length,
    navigationEntries: navEntries.length,
    navigationExact,
    functionalContractProven: statuses.FUNCTIONAL_CONTRACT_PROVEN ?? 0,
    connectRequired: statuses.CONNECT_REQUIRED ?? 0,
    partialOrBroken: statuses.PARTIAL_OR_BROKEN ?? 0,
    invalidModules: invalidModules.length,
    readyForRuntimeGate: navigationExact && invalidModules.length === 0,
  },
  navigation: {
    duplicateIds: [...new Set(duplicateNavIds)],
    duplicateRoutes: [...new Set(duplicateNavRoutes)],
    expectedIds,
    actualIds,
  },
  modules,
  digest: sha256(
    modules.map(({ id, route, status, issues, frontend, api, permissions, persistence }) => ({
      id,
      route,
      status,
      issues,
      frontend,
      api,
      permissions,
      persistence,
    })),
  ),
};

if (writeEvidence) {
  mkdirSync(dirname(resolve(root, outputPath)), { recursive: true });
  writeFileSync(resolve(root, outputPath), `${JSON.stringify(evidence, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (!evidence.summary.readyForRuntimeGate) process.exitCode = 1;
