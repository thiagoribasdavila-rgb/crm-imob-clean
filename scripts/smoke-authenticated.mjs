import { randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const baseUrl = (process.env.ATLAS_BASE_URL || process.env.PREVIEW_URL || "").replace(/\/$/, "");
const email = process.env.ATLAS_TEST_EMAIL || process.env.TEST_EMAIL || "";
const password = process.env.ATLAS_TEST_PASSWORD || process.env.TEST_PASSWORD || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const writeEnabled = process.env.ATLAS_SMOKE_WRITE === "true";

const required = [
  ["ATLAS_BASE_URL or PREVIEW_URL", baseUrl],
  ["ATLAS_TEST_EMAIL or TEST_EMAIL", email],
  ["ATLAS_TEST_PASSWORD or TEST_PASSWORD", password],
  ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY", supabaseAnonKey],
];

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL ${message}`);
}

async function request(path, token, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Request-Id": randomUUID(),
      "X-Correlation-Id": randomUUID(),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

for (const [name, value] of required) {
  if (!value) fail(`Missing ${name}`);
}

if (failures > 0) process.exit(1);

console.log(`Atlas authenticated smoke test: ${baseUrl}`);

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error || !data.session?.access_token) {
  fail(`Supabase login failed: ${error?.message || "missing access token"}`);
  process.exit(1);
}

const token = data.session.access_token;
console.log("PASS Supabase login returned an access token");

const me = await request("/api/v1/auth/me", token);
if (me.response.status !== 200) fail(`/api/v1/auth/me expected 200, got ${me.response.status}`);
else console.log("PASS Identity API returned 200");

const listBefore = await request("/api/v1/crm/leads?limit=5", token);
if (listBefore.response.status !== 200) fail(`/api/v1/crm/leads list expected 200, got ${listBefore.response.status}`);
else console.log("PASS CRM leads list returned 200");

if (writeEnabled) {
  const runId = Date.now();
  const leadEmail = `atlas-smoke-${runId}@example.com`;
  const leadPayload = {
    name: `Teste Automatizado Atlas ${runId}`,
    email: leadEmail,
    phone: `119${String(runId).slice(-8)}`,
    source: "smoke-test",
    purpose: "moradia",
    notes: "Lead criado por smoke test autenticado. Pode ser removido depois.",
  };
  const idempotencyKey = `atlas-smoke-${runId}`;

  const create = await request("/api/v1/crm/leads", token, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(leadPayload),
  });
  if (create.response.status !== 201) fail(`lead create expected 201, got ${create.response.status}: ${JSON.stringify(create.body).slice(0, 300)}`);
  else console.log("PASS Lead creation returned 201");

  const replay = await request("/api/v1/crm/leads", token, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(leadPayload),
  });
  if (replay.response.status !== 201 && replay.response.status !== 200) fail(`idempotency replay expected 200/201, got ${replay.response.status}`);
  else console.log("PASS Reusing the same Idempotency-Key did not duplicate the request");

  const duplicate = await request("/api/v1/crm/leads", token, {
    method: "POST",
    headers: { "Idempotency-Key": `atlas-smoke-duplicate-${runId}` },
    body: JSON.stringify(leadPayload),
  });
  if (duplicate.response.status !== 409) fail(`duplicate contact expected 409, got ${duplicate.response.status}`);
  else console.log("PASS Duplicate contact returned 409");

  const search = await request(`/api/v1/crm/leads?limit=10&q=${encodeURIComponent(leadEmail)}`, token);
  const items = search.body?.data?.items || search.body?.items || [];
  if (search.response.status !== 200 || !Array.isArray(items) || !items.some((lead) => lead.email === leadEmail)) {
    fail("created lead was not found in CRM leads search");
  } else {
    console.log("PASS Created lead appears in CRM leads search");
  }
} else {
  console.log("SKIP Lead mutation tests. Set ATLAS_SMOKE_WRITE=true to create a disposable test lead and validate duplicate handling.");
}

await supabase.auth.signOut();

if (failures > 0) {
  console.error(`Authenticated smoke test failed with ${failures} failure(s).`);
  process.exit(1);
}

console.log("Authenticated smoke test completed successfully.");
