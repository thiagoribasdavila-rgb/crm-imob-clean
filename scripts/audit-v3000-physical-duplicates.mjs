import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const policy = JSON.parse(
  readFileSync(path.join(root, "config/v3000-physical-duplicate-cleanup.json"), "utf8"),
);
const baseline = JSON.parse(
  readFileSync(path.join(root, policy.baselineEvidence), "utf8"),
);
const tracked = new Set(
  execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean),
);
const sourceFiles = execFileSync("git", ["ls-files", "-z", "app", "components", "lib"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
const routeInventory = JSON.parse(
  execFileSync("node", ["scripts/audit-v3000-route-inventory.mjs"], {
    cwd: root,
    encoding: "utf8",
  }),
);

const failures = [];
const source = sourceFiles
  .filter((file) => existsSync(path.join(root, file)))
  .map((file) => ({ file, content: readFileSync(path.join(root, file), "utf8") }))
  .filter(({ file }) => !policy.removedEmptyStubs.some((stub) => stub.path === file));

for (const stub of policy.removedEmptyStubs) {
  if (existsSync(path.join(root, stub.path))) failures.push(`${stub.path} ainda existe fisicamente.`);

  const modulePath = stub.path.replace(/\.(?:ts|tsx|js|jsx)$/, "");
  const aliases = [`@/${modulePath}`, modulePath];
  const references = source.filter(({ content }) =>
    aliases.some((alias) => content.includes(`"${alias}"`) || content.includes(`'${alias}'`)),
  );
  if (references.length > 0) {
    failures.push(`${stub.path} ainda é importado por ${references.map(({ file }) => file).join(", ")}.`);
  }
}

for (const [key, expected] of Object.entries(policy.expectedRouteInventory)) {
  const actual = routeInventory.summary[key];
  if (actual !== expected) failures.push(`Inventário ${key}: esperado ${expected}, obtido ${actual}.`);
}

const preserved = ["activeRouteFiles", "activePages", "activeApis", "activeCollisions"];
for (const key of preserved) {
  if (routeInventory.summary[key] !== baseline.summary[key]) {
    failures.push(
      `Superfície ativa mudou em ${key}: ${baseline.summary[key]} → ${routeInventory.summary[key]}.`,
    );
  }
}

const canonicalAiDashboard = "app/(crm)/ai-dashboard/page.tsx";
if (!tracked.has(canonicalAiDashboard) || readFileSync(path.join(root, canonicalAiDashboard), "utf8").trim().length === 0) {
  failures.push("O cockpit canônico /ai-dashboard não está preservado.");
}

const result = {
  ok: failures.length === 0,
  phase: policy.phase,
  removedEmptyStubs: policy.removedEmptyStubs.length,
  activeSurfacePreserved: preserved.every(
    (key) => routeInventory.summary[key] === baseline.summary[key],
  ),
  before: {
    routeFiles: baseline.summary.routeFiles,
    quarantinedRouteFiles: baseline.summary.quarantinedRouteFiles,
    allSourceCollisions: baseline.summary.allSourceCollisions,
  },
  after: {
    routeFiles: routeInventory.summary.routeFiles,
    quarantinedRouteFiles: routeInventory.summary.quarantinedRouteFiles,
    allSourceCollisions: routeInventory.summary.allSourceCollisions,
  },
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
