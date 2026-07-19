import { execFileSync } from "node:child_process";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const isLegacy = (file) => legacyRoutePaths.some((path) => file === path || file.startsWith(`${path}/`));
const count = (pattern, source = files) => source.filter((file) => pattern.test(file)).length;
const activeFiles = files.filter((file) => !isLegacy(file));
const publicVariables = new Set();
const serverVariables = new Set();

for (const file of activeFiles.filter((file) => /\.(?:ts|tsx|mjs|cjs)$/.test(file))) {
  const content = execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  for (const match of content.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
    (match[1].startsWith("NEXT_PUBLIC_") ? publicVariables : serverVariables).add(match[1]);
  }
}

const inventory = {
  generatedFrom: execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim(),
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
    productionTarget: "Hostinger Node.js 20.9+",
    databaseAuthStorage: "Supabase",
    historicalV2Dependency: false,
    legacyPrototypePathsExcludedFromPackage: legacyRoutePaths.length,
  },
};

console.log(JSON.stringify(inventory, null, 2));
