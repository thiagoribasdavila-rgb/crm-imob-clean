import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";

const root = process.cwd();
const quarantineRoot = join(root, ".atlas-dev-quarantine");
const moved = [];
let restored = false;

function quarantine(relativePath) {
  const source = join(root, relativePath);
  if (!existsSync(source)) return;
  const target = join(quarantineRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  renameSync(source, target);
  moved.push({ source, target });
}

function restore() {
  if (restored) return;
  restored = true;
  for (const { source, target } of moved.reverse()) {
    if (!existsSync(target)) continue;
    mkdirSync(dirname(source), { recursive: true });
    renameSync(target, source);
  }
  if (existsSync(quarantineRoot)) {
    rmSync(quarantineRoot, { recursive: true, force: true });
  }
}

rmSync(quarantineRoot, { recursive: true, force: true });
legacyRoutePaths.forEach(quarantine);

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["next", "dev"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(`Falha ao iniciar o Next.js: ${error.message}`);
  restore();
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  restore();
  if (signal) {
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    return;
  }
  process.exitCode = code ?? 1;
});

process.on("exit", restore);
