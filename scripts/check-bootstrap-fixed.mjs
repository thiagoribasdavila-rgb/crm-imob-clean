import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--test",
    "tests/contracts/bootstrap-public-route.test.mjs",
  ],
  { cwd: process.cwd(), encoding: "utf8", stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  "ATLAS BOOTSTRAP FIXED: PASSED (/setup público; ativação única; Atlas One)",
);
