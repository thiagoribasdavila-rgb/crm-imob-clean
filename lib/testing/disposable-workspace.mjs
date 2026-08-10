import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

const WORKSPACE_PREFIX = "atlas-one-e2e-";
const MARKER_FILE = ".atlas-e2e-disposable.json";
const MARKER_KIND = "atlas-one-disposable-e2e-workspace";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const REQUIRED_SOURCE_PATHS = [
  "package.json",
  "playwright.config.mjs",
  "scripts/dev.mjs",
  "supabase/config.toml",
  "tests/e2e/authenticated-journeys.spec.mjs",
  "node_modules/.bin/playwright",
];

function isEnvironmentFile(name) {
  return name === ".env" || name.startsWith(".env.");
}

function isArchive(name) {
  return /\.(?:zip|tar|tgz|gz)$/i.test(name);
}

function isSensitiveLocalFile(name) {
  const normalized = name.toLowerCase();
  return (
    [
      ".npmrc",
      ".pnpmrc",
      ".yarnrc",
      ".yarnrc.yml",
      "credentials.json",
      "service-account.json",
    ].includes(normalized) || /\.(?:key|pem|p12|pfx)$/i.test(normalized)
  );
}

function normalizedRelativePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function shouldCopy(sourceRoot, sourcePath) {
  const name = basename(sourcePath);
  const relativePath = normalizedRelativePath(sourceRoot, sourcePath);

  if (!relativePath) return true;
  if (isEnvironmentFile(name) || isArchive(name) || isSensitiveLocalFile(name)) {
    return false;
  }
  if (EXCLUDED_DIRECTORIES.has(name)) return false;
  if (relativePath === "supabase/.temp" || relativePath.startsWith("supabase/.temp/")) {
    return false;
  }

  if (existsSync(sourcePath) && lstatSync(sourcePath).isSymbolicLink()) {
    return false;
  }

  return true;
}

function assertSafeTemporaryPath(path) {
  const resolved = resolve(path);
  const temporaryRoot = realpathSync(tmpdir());
  const parent = realpathSync(resolve(resolved, ".."));
  if (parent !== temporaryRoot || !basename(resolved).startsWith(WORKSPACE_PREFIX)) {
    throw new Error("recusa remover diretório fora do espaço temporário Atlas");
  }
  return resolved;
}

export function assessDisposableWorkspacePlan(sourceRoot = process.cwd()) {
  const resolvedRoot = resolve(sourceRoot);
  const missing = REQUIRED_SOURCE_PATHS.filter(
    (path) => !existsSync(join(resolvedRoot, path)),
  );
  return {
    ready: missing.length === 0,
    missing,
    sourceEnvironmentPresent: readdirSync(resolvedRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isEnvironmentFile(entry.name))
      .map((entry) => entry.name)
      .sort(),
  };
}

export function createDisposableWorkspace(sourceRoot = process.cwd()) {
  const resolvedSource = resolve(sourceRoot);
  const plan = assessDisposableWorkspacePlan(resolvedSource);
  if (!plan.ready) {
    throw new Error(`workspace de origem incompleto: ${plan.missing.join(", ")}`);
  }

  const targetRoot = mkdtempSync(join(tmpdir(), WORKSPACE_PREFIX));
  try {
    cpSync(resolvedSource, targetRoot, {
      recursive: true,
      dereference: false,
      filter: (sourcePath) => shouldCopy(resolvedSource, sourcePath),
    });

    symlinkSync(join(resolvedSource, "node_modules"), join(targetRoot, "node_modules"), "dir");
    writeFileSync(
      join(targetRoot, MARKER_FILE),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          kind: MARKER_KIND,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );

    const inspection = inspectDisposableWorkspace(targetRoot);
    if (!inspection.isolated) {
      throw new Error(
        `cópia descartável reprovada: ${[
          ...inspection.environmentFiles,
          ...inspection.forbiddenArtifacts,
          ...inspection.unexpectedSymlinks,
        ].join(", ")}`,
      );
    }
    return { path: targetRoot, inspection };
  } catch (error) {
    if (existsSync(join(targetRoot, MARKER_FILE))) {
      cleanupDisposableWorkspace(targetRoot);
    } else {
      rmSync(targetRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

export function inspectDisposableWorkspace(targetRoot) {
  const resolvedRoot = assertSafeTemporaryPath(targetRoot);
  const environmentFiles = [];
  const forbiddenArtifacts = [];
  const unexpectedSymlinks = [];

  function walk(currentPath) {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = join(currentPath, entry.name);
      const relativePath = normalizedRelativePath(resolvedRoot, entryPath);
      if (entry.name === MARKER_FILE) continue;

      if (isEnvironmentFile(entry.name)) environmentFiles.push(relativePath);
      if (isSensitiveLocalFile(entry.name)) forbiddenArtifacts.push(relativePath);
      if (
        EXCLUDED_DIRECTORIES.has(entry.name) &&
        !(relativePath === "node_modules" && entry.isSymbolicLink())
      ) {
        forbiddenArtifacts.push(relativePath);
      }
      if (relativePath === "supabase/.temp" || relativePath.startsWith("supabase/.temp/")) {
        forbiddenArtifacts.push(relativePath);
      }
      if (isArchive(entry.name)) forbiddenArtifacts.push(relativePath);

      if (entry.isSymbolicLink()) {
        if (relativePath !== "node_modules") unexpectedSymlinks.push(relativePath);
        continue;
      }
      if (entry.isDirectory()) walk(entryPath);
    }
  }

  walk(resolvedRoot);
  const nodeModulesPath = join(resolvedRoot, "node_modules");
  const nodeModulesReused =
    existsSync(nodeModulesPath) && lstatSync(nodeModulesPath).isSymbolicLink();

  return {
    isolated:
      environmentFiles.length === 0 &&
      forbiddenArtifacts.length === 0 &&
      unexpectedSymlinks.length === 0 &&
      nodeModulesReused,
    environmentFiles: environmentFiles.sort(),
    forbiddenArtifacts: [...new Set(forbiddenArtifacts)].sort(),
    unexpectedSymlinks: unexpectedSymlinks.sort(),
    nodeModulesReused,
  };
}

export function cleanupDisposableWorkspace(targetRoot) {
  const resolvedRoot = assertSafeTemporaryPath(targetRoot);
  const markerPath = join(resolvedRoot, MARKER_FILE);
  if (!existsSync(markerPath)) {
    throw new Error("marcador do workspace descartável ausente");
  }
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  if (marker.kind !== MARKER_KIND || marker.schemaVersion !== 1) {
    throw new Error("marcador do workspace descartável inválido");
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}

export const DISPOSABLE_WORKSPACE_MARKER = MARKER_FILE;
