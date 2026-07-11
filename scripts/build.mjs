import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const quarantineRoot = join(root, ".atlas-build-quarantine");

const legacyPaths = [
  "app/(ai)",
  "app/(autonomous)",
  "app/(andromeda)",
  "app/(atlas)",
  "app/(automation)",
  "app/(autonomous-business)",
  "app/(digital-life-form)",
  "app/(reality-engine)",
  "app/(engine)",
  "app/(unified-consciousness)",
  "app/analytics",
  "app/(crm)/analytics",
  "app/(crm)/kanban",
  "app/(crm)/pipedrive",
  "app/(crm)/pipeline/cold",
  "app/(crm)/pipeline/warm",
  "app/(crm)/pipeline/hot",
  "app/(crm)/pipeline/[stage]",
  "app/(crm)/leads/edit",
  "app/(crm)/leads/table",
  "app/(crm)/tasks/[id]",
  "app/api/leads",
];

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
  legacyPaths.forEach(quarantine);

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
