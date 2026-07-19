const base = (
  process.env.ATLAS_SMOKE_BASE_URL ||
  process.argv[2] ||
  ""
).replace(/\/$/, "");
if (!/^https:\/\//.test(base))
  throw new Error("Informe ATLAS_SMOKE_BASE_URL=https://dominio-publicado.");
const checks = [
  ["health", "/api/health"],
  ["ready", "/api/ready"],
  ["login", "/login"],
  ["password_recovery", "/forgot-password"],
];
const results = [];
for (const [name, path] of checks) {
  const started = Date.now();
  try {
    const response = await fetch(`${base}${path}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      }),
      location = response.headers.get("location") || "",
      passed =
        response.status >= 200 &&
        response.status < 400 &&
        !location.startsWith("http://");
    results.push({
      name,
      path,
      status: response.status,
      latencyMs: Date.now() - started,
      passed,
    });
  } catch (error) {
    results.push({
      name,
      path,
      status: 0,
      latencyMs: Date.now() - started,
      passed: false,
      error: error instanceof Error ? error.message : "failed",
    });
  }
}
console.log(
  JSON.stringify(
    { base, generatedAt: new Date().toISOString(), results },
    null,
    2,
  ),
);
if (results.some((r) => !r.passed)) process.exit(1);
