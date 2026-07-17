const baseUrl = (process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
const secret = process.env.ATLAS_CRON_SECRET || "";
if (!baseUrl || !secret) {
  console.error("ATLAS_BASE_URL e ATLAS_CRON_SECRET são obrigatórios.");
  process.exit(1);
}

for (const [worker, path] of [["nightly-sales", "/api/v2/ai/nightly-sales"], ["outbox", "/api/v2/outbox/process"]]) {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55_000) });
  const body = await response.text();
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), worker, status: response.status, response: body.slice(0, 2_000) }));
  if (!response.ok) process.exitCode = 1;
}
