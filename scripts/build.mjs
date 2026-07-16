import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";

const root = process.cwd();
const quarantineRoot = join(root, ".atlas-build-quarantine");

const moved = [];

function quarantine(relativePath) {
  const source = join(root, relativePath);
  if (!existsSync(source)) return;
  const target = join(quarantineRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  renameSync(source, target);
  moved.push({ source, target });
}

function restore() {
  for (const { source, target } of moved.reverse()) {
    if (!existsSync(target)) continue;
    mkdirSync(dirname(source), { recursive: true });
    renameSync(target, source);
  }
  if (existsSync(quarantineRoot)) rmSync(quarantineRoot, { recursive: true, force: true });
}

try {
  rmSync(quarantineRoot, { recursive: true, force: true });
  legacyRoutePaths.forEach(quarantine);

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["next", "build"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  process.exitCode = result.status ?? 1;
} finally {
  restore();
}
