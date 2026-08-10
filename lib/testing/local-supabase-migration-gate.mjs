import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const VERSION_PATTERN = /^(\d{14})_(.+)\.sql$/;
const REMOTE_FLAGS = new Set(["--linked", "--db-url", "--password", "-p"]);
const REMOTE_OPERATIONS = new Set(["push", "pull", "repair"]);

export function scanLocalMigrationCatalog(root = process.cwd()) {
  const migrationsDirectory = join(resolve(root), "supabase", "migrations");
  if (!existsSync(migrationsDirectory)) {
    return { ready: false, files: [], invalidNames: [], duplicates: [] };
  }

  const files = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const invalidNames = [];
  const versions = new Map();
  for (const file of files) {
    const match = file.match(VERSION_PATTERN);
    if (!match) {
      invalidNames.push(file);
      continue;
    }
    const group = versions.get(match[1]) ?? [];
    group.push(file);
    versions.set(match[1], group);
  }

  const duplicates = [...versions.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([version, group]) => ({ version, files: group }))
    .sort((left, right) => left.version.localeCompare(right.version));

  return {
    ready: files.length > 0 && invalidNames.length === 0 && duplicates.length === 0,
    files,
    migrationCount: files.length,
    versionCount: versions.size,
    invalidNames,
    duplicates,
  };
}

export function auditLocalSupabaseConfig(root = process.cwd()) {
  const configPath = join(resolve(root), "supabase", "config.toml");
  if (!existsSync(configPath)) {
    return { ready: false, errors: ["supabase/config.toml ausente"] };
  }
  const source = readFileSync(configPath, "utf8");
  const errors = [];
  if (!/^project_id\s*=\s*"[^"]+"/m.test(source)) errors.push("project_id local ausente");
  if (!/^\s*major_version\s*=\s*17\s*$/m.test(source)) {
    errors.push("Postgres local precisa permanecer na versão 17");
  }
  if (/^\s*auto_expose_new_tables\s*=\s*true\s*$/m.test(source)) {
    errors.push("novas tabelas não podem ser expostas automaticamente pela Data API");
  }
  if (!/\[db\.migrations\][\s\S]*?^\s*enabled\s*=\s*true\s*$/m.test(source)) {
    errors.push("migrations locais não estão habilitadas");
  }
  return {
    ready: errors.length === 0,
    errors,
    postgresMajorVersion: 17,
    autoExposeNewTables: false,
  };
}

export function auditMigrationSecurity(root = process.cwd(), catalog = scanLocalMigrationCatalog(root)) {
  const migrationsDirectory = join(resolve(root), "supabase", "migrations");
  const totals = {
    deprecatedAuthRoleCalls: 0,
    securityDefinerDeclarations: 0,
    fixedSearchPathDeclarations: 0,
    rlsEnableStatements: 0,
    grantStatements: 0,
  };
  for (const file of catalog.files) {
    const sql = readFileSync(join(migrationsDirectory, file), "utf8");
    totals.deprecatedAuthRoleCalls += (sql.match(/auth\.role\s*\(/gi) ?? []).length;
    totals.securityDefinerDeclarations += (sql.match(/security\s+definer/gi) ?? []).length;
    totals.fixedSearchPathDeclarations += (sql.match(/set\s+search_path\s*=/gi) ?? []).length;
    totals.rlsEnableStatements += (sql.match(/enable\s+row\s+level\s+security/gi) ?? []).length;
    totals.grantStatements += (sql.match(/\bgrant\b/gi) ?? []).length;
  }
  return {
    ...totals,
    deprecatedAuthRoleFree: totals.deprecatedAuthRoleCalls === 0,
    explicitGrantEvidence: totals.grantStatements > 0,
    rlsEvidence: totals.rlsEnableStatements > 0,
    securityDefinerReviewRequired:
      totals.securityDefinerDeclarations > totals.fixedSearchPathDeclarations,
  };
}

export function assertLocalOnlySupabaseCommand(args) {
  const tokens = args.map((value) => String(value));
  for (const token of tokens) {
    const flag = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    if (REMOTE_FLAGS.has(flag)) throw new Error(`flag remota proibida: ${flag}`);
    if (/supabase\.co|pozbrcsfthnhmnebfoxv/i.test(token)) {
      throw new Error("referência ao projeto operacional proibida");
    }
  }
  if (tokens[0] === "db" && REMOTE_OPERATIONS.has(tokens[1])) {
    throw new Error(`operação remota/destrutiva proibida: db ${tokens[1]}`);
  }
  if (tokens[0] === "migration" && tokens[1] === "repair") {
    throw new Error("alteração do histórico de migrations é proibida");
  }
  if (
    (tokens[0] === "db" && ["reset", "lint"].includes(tokens[1])) ||
    (tokens[0] === "migration" && tokens[1] === "list")
  ) {
    if (!tokens.includes("--local")) throw new Error("comando precisa declarar --local");
  }
  return true;
}

export function sanitizeLocalSupabaseEnvironment(environment = process.env) {
  const publicSupabasePrefix = ["NEXT", "PUBLIC", "SUPABASE", ""].join("_");
  const blocked = /^(?:SUPABASE_ACCESS_TOKEN|DATABASE_URL|POSTGRES(?:QL)?_|PG(?:HOST|PORT|USER|PASSWORD|DATABASE)|SUPABASE_(?:URL|SERVICE_ROLE_KEY|ANON_KEY)|ATLAS_DEFAULT_ORGANIZATION_ID)/i;
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) => !blocked.test(name) && !name.toUpperCase().startsWith(publicSupabasePrefix),
    ),
  );
}

export function evaluateLocalMigrationGate({ root = process.cwd(), runtime = {} } = {}) {
  const catalog = scanLocalMigrationCatalog(root);
  const config = auditLocalSupabaseConfig(root);
  const security = auditMigrationSecurity(root, catalog);
  const blockers = [];
  if (!catalog.ready) {
    if (catalog.invalidNames.length) blockers.push("invalid-migration-filenames");
    if (catalog.duplicates.length) blockers.push("duplicate-migration-versions");
    if (!catalog.files.length) blockers.push("migration-catalog-empty");
  }
  if (!config.ready) blockers.push("unsafe-local-supabase-config");
  if (!runtime.dockerAvailable) blockers.push("docker-runtime-unavailable");
  if (!runtime.supabaseCliAvailable) blockers.push("supabase-cli-unavailable");
  return {
    ready: blockers.length === 0,
    catalog,
    config,
    security,
    runtime: {
      dockerAvailable: runtime.dockerAvailable === true,
      supabaseCliAvailable: runtime.supabaseCliAvailable === true,
    },
    blockers,
    operationalEnvironmentTouched: false,
    remoteCommandsAllowed: false,
    secretsPrinted: false,
  };
}
