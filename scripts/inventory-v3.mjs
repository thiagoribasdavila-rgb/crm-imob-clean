import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";

const excludedDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "dist",
  "tmp",
  "outputs",
]);
function snapshotFiles(directory = ".") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).replace(/^\.\//, "");
    if (entry.isDirectory())
      return excludedDirectories.has(entry.name) ||
        entry.name.startsWith(".atlas-route-quarantine-")
        ? []
        : snapshotFiles(path);
    return entry.isFile() ? [path] : [];
  });
}
const gitWorkspace = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() === "true";
  } catch {
    return false;
  }
})();
const files = gitWorkspace
  ? execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean)
  : snapshotFiles().sort();
const isLegacy = (file) => legacyRoutePaths.some((path) => file === path || file.startsWith(`${path}/`));
const count = (pattern, source = files) => source.filter((file) => pattern.test(file)).length;
const activeFiles = files.filter((file) => !isLegacy(file));
const publicVariables = new Set();
const serverVariables = new Set();

for (const file of activeFiles.filter((file) => /\.(?:ts|tsx|mjs|cjs)$/.test(file))) {
  const content = gitWorkspace
    ? execFileSync("git", ["show", `HEAD:${file}`], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      })
    : readFileSync(file, "utf8");
  for (const match of content.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
    (match[1].startsWith("NEXT_PUBLIC_") ? publicVariables : serverVariables).add(match[1]);
  }
}

const inventory = {
  generatedFrom: gitWorkspace
    ? execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
        encoding: "utf8",
      }).trim()
    : "workspace-snapshot",
  trackedFiles: files.length,
  deployableFiles: activeFiles.length,
  excludedLegacyFiles: files.length - activeFiles.length,
  surface: {
    pagesTracked: count(/^app\/.*\/page\.tsx$/),
    pagesDeployable: count(/^app\/.*\/page\.tsx$/, activeFiles),
    apiRoutesTracked: count(/^app\/api\/.*\/route\.ts$/),
    apiRoutesDeployable: count(/^app\/api\/.*\/route\.ts$/, activeFiles),
    componentsDeployable: count(/^components\/.*\.(?:ts|tsx)$/, activeFiles),
    librariesDeployable: count(/^lib\/.*\.(?:ts|tsx)$/, activeFiles),
    supabaseMigrations: count(/^supabase\/migrations\/.*\.sql$/),
    prismaMigrations: count(/^prisma\/migrations\/.*\/migration\.sql$/),
    scripts: count(/^scripts\/.*\.(?:mjs|cjs|js)$/),
    documentationFiles: count(/^docs\/.*\.md$/),
  },
  environment: {
    publicVariables: [...publicVariables].sort(),
    serverVariables: [...serverVariables].sort(),
  },
  boundaries: {
    productionTarget: "Hostinger Node.js 22+ (Node 24 recomendado)",
    databaseAuthStorage: "Supabase",
    historicalV2Dependency: false,
    legacyPrototypePathsExcludedFromPackage: legacyRoutePaths.length,
  },
};

console.log(JSON.stringify(inventory, null, 2));
