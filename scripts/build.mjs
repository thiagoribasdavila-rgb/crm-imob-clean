import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";

const result = spawnSync(command, ["next", "build"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});

process.exitCode = result.status ?? 1;
