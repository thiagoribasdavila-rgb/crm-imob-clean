import { spawn } from "node:child_process";
import process from "node:process";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";
import { createRouteQuarantine } from "./route-quarantine.mjs";

const root = process.cwd();
const quarantine = createRouteQuarantine({ root, paths: legacyRoutePaths, mode: "dev" });

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
  quarantine.restore();
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  quarantine.restore();
  if (signal) {
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    return;
  }
  process.exitCode = code ?? 1;
});

process.on("exit", quarantine.restore);
