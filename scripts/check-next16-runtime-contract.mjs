import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";

const root = process.cwd();
const failures = [];
const observations = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

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

function isSource(path) {
  return /\.(ts|tsx|js|jsx)$/.test(path) && !path.endsWith(".d.ts");
}

function isQuarantined(path) {
  if (
    path === "components/ui/ProtectedRoute.tsx" ||
    path.startsWith("lib/data/") ||
    path.startsWith("lib/services/")
  ) {
    return true;
  }

  return legacyRoutePaths.some(
    (legacyPath) => path === legacyPath || path.startsWith(`${legacyPath}/`),
  );
}

function hasFunctionBoundary(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isConstructorDeclaration(current) ||
      ts.isGetAccessorDeclaration(current) ||
      ts.isSetAccessorDeclaration(current)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function callName(node) {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return "";
}

function auditImportTimeClients(path, source) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (
      (ts.isCallExpression(node) &&
        ["createBrowserClient", "createServerClient", "createClient"].includes(
          callName(node),
        )) ||
      (ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ["OpenAI", "Anthropic"].includes(node.expression.text))
    ) {
      if (!hasFunctionBoundary(node)) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        failures.push(
          `${path}:${position.line + 1} inicializa cliente externo durante o import; use inicialização lazy dentro de função`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function auditDynamicRoute(path, source) {
  if (!path.includes("[") || !/(page|route)\.(ts|tsx)$/.test(path)) return;

  const receivesParams =
    /\{\s*params\s*\}/.test(source) ||
    /\bparams\s*:\s*(?:Promise<)?\{/.test(source) ||
    /\bcontext\s*:\s*\{[\s\S]{0,120}\bparams\s*:/.test(source);
  const usesHook = /\buseParams\s*\(/.test(source);
  const unwrapsParams =
    /\bawait\s+(?:context\.)?params\b/.test(source) ||
    /\buse\s*\(\s*params\s*\)/.test(source);
  const promiseContract =
    /\bparams\s*:\s*Promise\s*</.test(source) ||
    /type\s+\w+\s*=\s*\{[\s\S]{0,200}\bparams\s*:\s*Promise\s*</.test(source);
  const directPropertyAccess = /\bparams\.(id|stage|slug)\b/.test(source);

  if (receivesParams && !usesHook) {
    expect(
      promiseContract,
      `${path} deve tipar params como Promise no contrato assíncrono do Next 16`,
    );
    expect(
      unwrapsParams,
      `${path} deve resolver params com await ou React.use antes do acesso`,
    );
  }
  expect(
    !directPropertyAccess,
    `${path} acessa params de rota sincronamente`,
  );
}

const sourceRoots = ["app", "components", "lib", "utils"];
const allSources = sourceRoots
  .flatMap((directory) => walk(resolve(root, directory)))
  .map(normalize)
  .filter(isSource);
const activeSources = allSources.filter((path) => !isQuarantined(path));
const quarantinedSources = allSources.filter(isQuarantined);

for (const path of activeSources) {
  const source = readFileSync(resolve(root, path), "utf8");
  auditImportTimeClients(path, source);
  auditDynamicRoute(path, source);
}

const browserClientSource = readFileSync(
  resolve(root, "lib/supabase.ts"),
  "utf8",
);
const adminClientSource = readFileSync(
  resolve(root, "lib/supabase/admin.ts"),
  "utf8",
);
const serverClientSource = readFileSync(
  resolve(root, "utils/supabase/server.ts"),
  "utf8",
);
const proxySource = readFileSync(resolve(root, "proxy.ts"), "utf8");

expect(
  browserClientSource.includes("export function getSupabase()") &&
    browserClientSource.includes("if (instance) return instance"),
  "o cliente Supabase do navegador deve continuar lazy e reutilizável",
);
expect(
  adminClientSource.includes('import "server-only"') &&
    adminClientSource.includes("export function getSupabaseAdmin()") &&
    adminClientSource.includes("if (adminClient) return adminClient"),
  "o cliente Supabase administrativo deve ser server-only e lazy",
);
expect(
  serverClientSource.includes("const cookieStore = await cookies()"),
  "o cliente Supabase do servidor deve aguardar cookies() no Next 16",
);
expect(
  proxySource.includes("export async function proxy(") &&
    proxySource.includes("return await refreshSession"),
  "proxy.ts deve manter atualização assíncrona de sessão",
);
expect(
  proxySource.includes("(?!api/|_next/static|_next/image"),
  "proxy.ts deve excluir APIs e ativos internos do matcher",
);

observations.push(`${activeSources.length} fontes ativas inspecionadas`);
observations.push(`${quarantinedSources.length} fontes legadas ignoradas`);
observations.push("params assíncronos validados");
observations.push("clientes externos lazy");
observations.push("proxy e cookies compatíveis");

if (failures.length) {
  console.error(`ATLAS Next 16 runtime: ${failures.length} falha(s)`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `ATLAS Next 16 runtime: contrato aprovado. ${observations.join("; ")}.`,
);
