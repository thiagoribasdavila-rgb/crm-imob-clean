const baseUrl = process.env.ATLAS_BASE_URL || "http://localhost:3000";

const checks = [
  { name: "health", path: "/api/health", expected: [200] },
  { name: "readiness", path: "/api/ready", expected: [200, 503] },
  { name: "v1-v2 status", path: "/api/v1-v2/status", expected: [200, 401, 503] },
  { name: "login", path: "/login", expected: [200] },
  { name: "dashboard guard", path: "/dashboard", expected: [200, 307, 308] },
  { name: "v2 guard", path: "/atlas-v2", expected: [200, 307, 308] },
  { name: "v3 guard", path: "/atlas-v3", expected: [200, 307, 308] },
];

let failed = 0;
for (const check of checks) {
  try {
    const response = await fetch(`${baseUrl}${check.path}`, { redirect: "manual" });
    const ok = check.expected.includes(response.status);
    console.log(`${ok ? "✓" : "✗"} ${check.name}: HTTP ${response.status}`);
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    console.error(`✗ ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed > 0) {
  console.error(`Atlas smoke test falhou em ${failed} verificação(ões).`);
  process.exit(1);
}

console.log("Atlas V1 + V2 + V3 smoke test concluído com sucesso.");
