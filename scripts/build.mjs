import { spawnSync } from "node:child_process";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";
import { createRouteQuarantine } from "./route-quarantine.mjs";

const root = process.cwd();
const quarantine = createRouteQuarantine({ root, paths: legacyRoutePaths, mode: "build" });

try {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["next", "build"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  process.exitCode = result.status ?? 1;
} finally {
  quarantine.restore();
}
