import process from "node:process";

const baseUrl = (process.env.ATLAS_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const checks = [
  { name: "Home", path: "/", expected: [200, 307, 308] },
  { name: "Login", path: "/login", expected: [200] },
  { name: "Health", path: "/api/health", expected: [200, 503] },
  { name: "Readiness", path: "/api/ready", expected: [200, 503] },
  { name: "Dashboard protegido", path: "/dashboard", expected: [200, 307, 308] },
  { name: "V2 Command Center protegido", path: "/atlas-v2", expected: [200, 307, 308] },
];

let failed = 0;
console.log(`\nATLAS AI — Smoke V1 + V2 (${baseUrl})\n`);

for (const check of checks) {
  try {
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}${check.path}`, { redirect: "manual" });
    const duration = Date.now() - startedAt;
    const ok = check.expected.includes(response.status);
    console.log(`${ok ? "✅" : "❌"} ${check.name}: HTTP ${response.status} (${duration} ms)`);
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    console.log(`❌ ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} verificação(ões) falharam.`);
  process.exit(1);
}

console.log("\n✅ Smoke V1 + V2 concluído.\n");
