import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const baseUrl = (process.env.PREVIEW_URL || process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
const email = process.env.TEST_EMAIL || process.env.ATLAS_TEST_EMAIL || "";
const password = process.env.TEST_PASSWORD || process.env.ATLAS_TEST_PASSWORD || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const runId = (process.env.TEST_RUN_ID || new Date().toISOString().replace(/\D/g, "").slice(0, 14)).toLowerCase();

const required = {
  PREVIEW_URL: baseUrl,
  TEST_EMAIL: email,
  TEST_PASSWORD: password,
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_OR_ANON_KEY: supabaseKey,
};

const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  console.error(`❌ Variáveis ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

function baseHeaders(extra = {}) {
  return {
    accept: "application/json",
    ...(bypassSecret
      ? {
          "x-vercel-protection-bypass": bypassSecret,
          "x-vercel-set-bypass-cookie": "true",
        }
      : {}),
    ...extra,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
    headers: baseHeaders(options.headers),
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

function assertStatus(label, actual, expected) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(actual)) {
    throw new Error(`${label}: esperado HTTP ${allowed.join("/")}, recebido ${actual}`);
  }
  console.log(`✅ ${label}: HTTP ${actual}`);
}

function extractLead(body) {
  return body?.data?.lead ?? body?.lead ?? null;
}

console.log(`\nATLAS AI — Smoke autenticado (${baseUrl})\n`);

try {
  const unauthenticated = await request("/api/v1/crm/leads?limit=1");
  assertStatus("API de leads sem autenticação", unauthenticated.response.status, 401);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !signInData.session?.access_token) {
    throw new Error(`Login Supabase falhou: ${signInError?.message || "access token ausente"}`);
  }
  console.log("✅ Login Supabase: sessão real obtida");

  const authHeaders = { Authorization: `Bearer ${signInData.session.access_token}` };

  const identity = await request("/api/v1/auth/me", { headers: authHeaders });
  assertStatus("Identidade autenticada", identity.response.status, 200);

  const dashboard = await request("/dashboard", { headers: authHeaders });
  assertStatus("Dashboard autenticado", dashboard.response.status, [200, 307, 308]);

  const listBefore = await request("/api/v1/crm/leads?limit=5", { headers: authHeaders });
  assertStatus("Listagem inicial de leads", listBefore.response.status, 200);

  const idempotencyKey = `atlas-smoke:${runId}`;
  const testEmail = `atlas.smoke.${runId}@example.invalid`;
  const payload = {
    name: `Atlas Smoke ${runId}`,
    email: testEmail,
    source: "atlas_e2e",
    notes: `Teste automatizado ${runId}. Pode ser removido após homologação.`,
  };

  const createHeaders = {
    ...authHeaders,
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
  };

  const created = await request("/api/v1/crm/leads", {
    method: "POST",
    headers: createHeaders,
    body: JSON.stringify(payload),
  });
  assertStatus("Criação válida de lead", created.response.status, 201);

  const createdLead = extractLead(created.body);
  if (!createdLead?.id) throw new Error("Criação válida: resposta sem lead.id");
  console.log(`✅ Lead criado: ${createdLead.id}`);

  const repeated = await request("/api/v1/crm/leads", {
    method: "POST",
    headers: createHeaders,
    body: JSON.stringify(payload),
  });
  assertStatus("Repetição com mesma Idempotency-Key", repeated.response.status, 201);

  const repeatedLead = extractLead(repeated.body);
  if (repeatedLead?.id !== createdLead.id) {
    throw new Error("Idempotência falhou: a repetição não retornou o mesmo lead");
  }
  console.log("✅ Idempotência: mesma resposta reaproveitada");

  const duplicate = await request("/api/v1/crm/leads", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "idempotency-key": `${idempotencyKey}:duplicate`,
    },
    body: JSON.stringify(payload),
  });
  assertStatus("Duplicidade por contato com chave diferente", duplicate.response.status, 409);

  const leadById = await request(`/api/v1/crm/leads/${createdLead.id}`, { headers: authHeaders });
  assertStatus("Consulta do lead por ID", leadById.response.status, 200);

  const updated = await request(`/api/v1/crm/leads/${createdLead.id}`, {
    method: "PATCH",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ status: "em_atendimento" }),
  });
  assertStatus("Atualização do status do lead", updated.response.status, 200);

  const lead360 = await request(`/api/v1/crm/leads/${createdLead.id}/360`, { headers: authHeaders });
  assertStatus("Lead 360", lead360.response.status, 200);

  const search = await request(`/api/v1/crm/leads?limit=5&q=${encodeURIComponent(testEmail)}`, { headers: authHeaders });
  assertStatus("Busca do lead criado", search.response.status, 200);
  const items = search.body?.data?.items ?? [];
  if (!items.some((item) => item.id === createdLead.id)) {
    throw new Error("O lead criado não apareceu na listagem pesquisada");
  }
  console.log("✅ Lead aparece na listagem após criação");

  await supabase.auth.signOut();
  console.log("\n✅ Smoke autenticado concluído sem falhas.\n");
} catch (error) {
  console.error(`\n❌ Smoke autenticado falhou: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
