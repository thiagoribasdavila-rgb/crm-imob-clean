const baseUrl = (process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
const secret = process.env.ATLAS_CRON_SECRET || "";
if (!baseUrl || !secret) process.exit(1);
const response = await fetch(`${baseUrl}/api/v2/meta/daily-report`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55_000) });
const body = await response.text();
console.log(JSON.stringify({ timestamp: new Date().toISOString(), worker: "meta-daily-report", status: response.status, response: body.slice(0, 2000) }));
if (!response.ok) process.exit(1);
