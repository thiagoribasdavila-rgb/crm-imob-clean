import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";
import { createRouteQuarantine } from "./route-quarantine.mjs";

const root = process.cwd();
const quarantine = createRouteQuarantine({ root, paths: legacyRoutePaths, mode: "build" });
const nextBin = resolve(root, "node_modules/next/dist/bin/next");
// O padrão é o turbopack porque é o que este projeto já usava (`next build` sem
// flag no Next 16) e é o perfil de chunking que o orçamento de performance mede:
// com webpack o build gera 772 chunks contra o teto de 600 e reprova
// check-performance-budget. Manter webpack como opção explícita ainda é útil —
// ele valida o contrato de página do Next, que o turbopack não checa.
const requestedBundler = (process.env.ATLAS_NEXT_BUNDLER || "turbopack").toLowerCase();

if (!existsSync(nextBin)) {
  throw new Error(
    "Next.js não está instalado localmente. Execute `npm ci` antes do build.",
  );
}

if (!["webpack", "turbopack"].includes(requestedBundler)) {
  throw new Error(
    "ATLAS_NEXT_BUNDLER deve ser `webpack` ou `turbopack`.",
  );
}

try {
  const buildArgs = [nextBin, "build"];
  if (requestedBundler === "webpack") buildArgs.push("--webpack");

  console.log(
    `ATLAS build: Next.js com ${requestedBundler} (runtime local, sem download implícito).`,
  );

  const result = spawnSync(process.execPath, buildArgs, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  process.exitCode = result.status ?? 1;
} finally {
  quarantine.restore();
}
