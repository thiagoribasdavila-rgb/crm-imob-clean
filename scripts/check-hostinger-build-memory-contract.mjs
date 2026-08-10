import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");

const buildScript = read("scripts/build.mjs");
const nextConfig = read("next.config.ts");
const packageJson = JSON.parse(read("package.json"));
const validate = packageJson.scripts?.validate ?? "";

for (const dependency of [
  "@tailwindcss/postcss",
  "tailwindcss",
  "shadcn",
  "typescript",
  "@types/node",
  "@types/react",
  "@types/react-dom",
]) {
  assert.ok(
    packageJson.dependencies?.[dependency],
    `${dependency} precisa estar em dependencies para builds da Hostinger com devDependencies omitidas.`,
  );
  assert.equal(
    packageJson.devDependencies?.[dependency],
    undefined,
    `${dependency} não pode depender apenas de devDependencies.`,
  );
}

assert.match(
  buildScript,
  /ATLAS_NEXT_BUNDLER\s*\|\|\s*["']turbopack["']/,
  "O build da Hostinger deve usar Turbopack por padrão.",
);
assert.match(
  nextConfig,
  /productionBrowserSourceMaps:\s*false/,
  "Source maps do navegador devem permanecer desativados na produção.",
);
assert.match(
  nextConfig,
  /enablePrerenderSourceMaps:\s*false/,
  "Source maps de prerender devem permanecer desativados.",
);
assert.match(
  nextConfig,
  /webpackMemoryOptimizations:\s*true/,
  "A otimização de memória do Webpack deve permanecer ativa para o fallback.",
);
assert.match(
  nextConfig,
  /ignoreBuildErrors:\s*true/,
  "O build restrito não deve repetir o programa TypeScript já auditado.",
);

const typecheckPosition = validate.indexOf("npm run typecheck");
const buildPosition = validate.indexOf("npm run build");
assert.ok(typecheckPosition >= 0, "O gate de release precisa executar typecheck.");
assert.ok(buildPosition > typecheckPosition, "O typecheck precisa ocorrer antes do build.");

console.log("Hostinger build memory contract: OK");
