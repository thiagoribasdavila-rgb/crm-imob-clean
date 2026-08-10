import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  legacyComponentPaths,
  legacyRoutePaths,
} from "./legacy-route-paths.mjs";

const root = process.cwd();
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function normalize(path) {
  return relative(root, path).replaceAll("\\", "/");
}

function isRouteFile(path) {
  return /(^|\/)(page|route)\.(ts|tsx|js|jsx)$/.test(path);
}

function isPageFile(path) {
  return /(^|\/)page\.(ts|tsx|js|jsx)$/.test(path);
}

function isQuarantined(path) {
  return legacyRoutePaths.some(
    (legacyPath) => path === legacyPath || path.startsWith(`${legacyPath}/`),
  );
}

function isQuarantinedComponent(path) {
  return legacyComponentPaths.some(
    (legacyPath) => path === legacyPath || path.startsWith(`${legacyPath}/`),
  );
}

function canonicalRoute(path) {
  const segments = path.replace(/^app\//, "").split("/");
  segments.pop();
  const visibleSegments = segments.filter(
    (segment) => !/^\(.+\)$/.test(segment),
  );
  return `/${visibleSegments.join("/")}`;
}

function staticInternalDestinations(source) {
  const executableSource = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  return [
    ...executableSource.matchAll(
      /(?:\bhref\s*=\s*|\bhref\s*:\s*)["'](\/(?!\/|api\/)[^"'?#]*)[^"']*["']/g,
    ),
  ].map((match) => match[1].replace(/\/+$/, "") || "/");
}

function routeMatches(destination, route) {
  if (destination === route) return true;
  const routeSegments = route.split("/").filter(Boolean);
  const destinationSegments = destination.split("/").filter(Boolean);
  const catchAllIndex = routeSegments.findIndex((segment) =>
    /^\[\[?\.\.\..+\]\]?$/.test(segment),
  );
  if (catchAllIndex === -1 && routeSegments.length !== destinationSegments.length) {
    return false;
  }
  if (catchAllIndex !== -1 && destinationSegments.length < catchAllIndex) {
    return false;
  }
  return routeSegments.every((segment, index) => {
    if (/^\[\[?\.\.\..+\]\]?$/.test(segment)) return true;
    if (/^\[.+\]$/.test(segment)) return Boolean(destinationSegments[index]);
    return destinationSegments[index] === segment;
  });
}

function duplicates(files) {
  const routes = new Map();
  for (const file of files) {
    const route = canonicalRoute(file);
    routes.set(route, [...(routes.get(route) || []), file]);
  }
  return [...routes.entries()]
    .filter(([, entries]) => entries.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));
}

const routeFiles = walk(resolve(root, "app")).map(normalize).filter(isRouteFile);
const activeRouteFiles = routeFiles.filter((path) => !isQuarantined(path));
const activeDuplicates = duplicates(activeRouteFiles);
const activePageRoutes = new Set(
  activeRouteFiles.filter(isPageFile).map(canonicalRoute),
);
const uniquePaths = new Set(legacyRoutePaths);
const buildSource = readFileSync(resolve(root, "scripts/build.mjs"), "utf8");
const devSource = readFileSync(resolve(root, "scripts/dev.mjs"), "utf8");
const packageSource = readFileSync(
  resolve(root, "scripts/package-hostinger.mjs"),
  "utf8",
);
const activeTsConfig = readFileSync(resolve(root, "tsconfig.active.json"), "utf8");
const navigationSource = readFileSync(
  resolve(root, "lib/atlas/navigation.ts"),
  "utf8",
);
const navigationDestinations = [
  ...navigationSource.matchAll(/\bhref:\s*"([^"]+)"/g),
].map((match) => match[1].split("?")[0].split("#")[0]);
const conceptualGroups = [
  "app/(collective-intelligence)",
  "app/(consciousness)",
  "app/(economic-system)",
  "app/(ecosystem)",
  "app/(meta-economy)",
  "app/(reality-control)",
  "app/(self-replicating)",
  "app/(supreme-market)",
];
const sourceFiles = [
  ...walk(resolve(root, "app")),
  ...walk(resolve(root, "components")),
  ...walk(resolve(root, "lib")),
]
  .map(normalize)
  .filter((path) => /\.(ts|tsx|js|jsx)$/.test(path));
const activeSourceFiles = sourceFiles.filter(
  (path) =>
    !isQuarantined(path) &&
    !isQuarantinedComponent(path) &&
    !path.startsWith("lib/data/"),
);
const demoIdentityPattern =
  /\b(?:João Silva|Carlos Mendes|Mariana Souza|Mariana Costa)\b/;
const activeDemoIdentityFiles = activeSourceFiles.filter((path) =>
  demoIdentityPattern.test(readFileSync(resolve(root, path), "utf8")),
);
const rawDatabaseErrorPattern =
  /setError\(\s*(?:queryError|firstError|databaseError)\.message\s*\)|\{\s*(?:queryError|firstError|databaseError)\.message\s*\}/;
const activePagesLeakingRawDatabaseErrors = activeRouteFiles
  .filter(isPageFile)
  .filter((path) =>
    rawDatabaseErrorPattern.test(
      readFileSync(resolve(root, path), "utf8"),
    ),
  );
const staticInternalLinks = new Map();
for (const path of activeSourceFiles) {
  const source = readFileSync(resolve(root, path), "utf8");
  for (const destination of staticInternalDestinations(source)) {
    staticInternalLinks.set(
      destination,
      [...(staticInternalLinks.get(destination) || []), path],
    );
  }
}
const unresolvedInternalLinks = [...staticInternalLinks.entries()].filter(
  ([destination]) =>
    ![...activePageRoutes].some((route) => routeMatches(destination, route)),
);

expect(
  uniquePaths.size === legacyRoutePaths.length,
  "a lista de rotas legadas contém caminhos duplicados",
);
expect(
  buildSource.includes('from "./legacy-route-paths.mjs"'),
  "o build deve reutilizar a lista canônica de rotas legadas",
);
expect(
  devSource.includes('from "./legacy-route-paths.mjs"'),
  "o modo de desenvolvimento deve reutilizar a lista canônica de rotas legadas",
);
expect(
  packageSource.includes("legacyComponentPaths"),
  "o pacote Hostinger deve remover os componentes históricos pela lista canônica",
);
expect(
  activeDuplicates.length === 0,
  `rotas ativas colidem: ${activeDuplicates
    .map(([route, entries]) => `${route} => ${entries.join(", ")}`)
    .join(" | ")}`,
);

for (const conceptualGroup of conceptualGroups) {
  expect(
    legacyRoutePaths.includes(conceptualGroup),
    `a superfície conceitual ${conceptualGroup} precisa permanecer isolada do produto oficial`,
  );
}

for (const destination of new Set(navigationDestinations)) {
  expect(
    activePageRoutes.has(destination),
    `a navegação oficial aponta para uma página ausente ou isolada: ${destination}`,
  );
}

for (const legacyPath of legacyComponentPaths) {
  const exactEntry = `"${legacyPath}"`;
  const globEntry = `"${legacyPath}/**"`;
  expect(
    activeTsConfig.includes(exactEntry) || activeTsConfig.includes(globEntry),
    `o componente histórico ${legacyPath} não está excluído do contrato TypeScript ativo`,
  );
  expect(
    packageSource.includes("for (const relativePath of legacyComponentPaths)"),
    "o empacotamento não remove os componentes históricos",
  );
}

expect(
  activeDemoIdentityFiles.length === 0,
  `dados demonstrativos aparecem na superfície ativa: ${activeDemoIdentityFiles.join(", ")}`,
);
expect(
  activePagesLeakingRawDatabaseErrors.length === 0,
  `páginas ativas expõem erro técnico bruto do banco: ${activePagesLeakingRawDatabaseErrors.join(", ")}`,
);
expect(
  unresolvedInternalLinks.length === 0,
  `links internos estáticos sem página ativa: ${unresolvedInternalLinks
    .map(([destination, paths]) => `${destination} => ${paths.join(", ")}`)
    .join(" | ")}`,
);

for (const legacyPath of legacyRoutePaths) {
  const exactEntry = `"${legacyPath}"`;
  const globEntry = `"${legacyPath}/**"`;
  expect(
    activeTsConfig.includes(exactEntry) || activeTsConfig.includes(globEntry),
    `a rota legada ${legacyPath} não está excluída do contrato TypeScript ativo`,
  );
}

if (failures.length) {
  console.error(`ATLAS rotas ativas: ${failures.length} falha(s)`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  [
    "ATLAS rotas ativas: contrato aprovado.",
    `${activeRouteFiles.length} arquivos de rota ativos.`,
    `${routeFiles.length - activeRouteFiles.length} arquivos de rota legados isolados.`,
    `${activePageRoutes.size} páginas ativas e ${new Set(navigationDestinations).size} destinos oficiais verificados.`,
    `${staticInternalLinks.size} links internos estáticos verificados.`,
    "0 páginas expondo erro bruto do banco.",
    `${legacyComponentPaths.length} grupos de componentes demonstrativos isolados.`,
    "0 colisões ativas.",
  ].join(" "),
);
