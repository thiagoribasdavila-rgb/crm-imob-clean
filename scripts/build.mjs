import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";
import { createRouteQuarantine } from "./route-quarantine.mjs";

const root = process.cwd();
const quarantine = createRouteQuarantine({ root, paths: legacyRoutePaths, mode: "build" });
const nextBin = resolve(root, "node_modules/next/dist/bin/next");
const requestedBundler = (process.env.ATLAS_NEXT_BUNDLER || "webpack").toLowerCase();

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
