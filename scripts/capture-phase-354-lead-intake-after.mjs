import process from "node:process";
import path from "node:path";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

function required(name, value, missing) {
  const normalized = String(value || "").trim();
  if (!normalized) missing.push(name);
  return normalized;
}

function safeBaseUrl(value) {
  const parsed = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("ATLAS_BASE_URL deve usar HTTPS, exceto em localhost.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function assertUuid(name, value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} não foi resolvido como UUID válido.`);
  }
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function finiteMetric(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

async function responseJson(response) {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw new Error(`Resposta inválida (HTTP ${response.status}).`);
  return payload;
}

async function apiGet(baseUrl, route, accessToken) {
  return fetch(`${baseUrl}${route}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Request-Id": crypto.randomUUID(),
      "X-Correlation-Id": crypto.randomUUID(),
    },
    redirect: "manual",
  });
}

async function writeJsonAtomically(filePath, value) {
  const absolutePath = path.resolve(filePath);
  const directory = path.dirname(absolutePath);
  const temporaryPath = `${absolutePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, absolutePath);
  return absolutePath;
}

const missing = [];
const rawBaseUrl = required("ATLAS_BASE_URL", process.env.ATLAS_BASE_URL, missing);
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL, missing);
const publicKey = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  missing,
);
const email = required("ATLAS_TEST_EMAIL", process.env.ATLAS_TEST_EMAIL, missing);
const password = required("ATLAS_TEST_PASSWORD", process.env.ATLAS_TEST_PASSWORD, missing);
const evidenceFile = process.env.ATLAS_PHASE_354_AFTER_EVIDENCE_FILE
  || "artifacts/runtime/phase-354/lead-intake-after.json";
const requestedDays = Number(process.env.ATLAS_PHASE_354_PERIOD_DAYS || 14);
const periodDays = Number.isFinite(requestedDays)
  ? Math.min(31, Math.max(7, Math.trunc(requestedDays)))
  : 14;

if (missing.length > 0) {
  console.log(JSON.stringify({
    schema: "atlas.phase-354-after-capture-preflight.v1",
    status: "blocked_without_remote_read",
    missing,
    artifactWritten: false,
    safety: { remoteMutation: false, secretsPrinted: false },
  }, null, 2));
  process.exit(2);
}

const baseUrl = safeBaseUrl(rawBaseUrl);
const supabase = createClient(supabaseUrl, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

try {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  const token = authData.session?.access_token;
  if (authError || !token) throw new Error("A conta de homologação não conseguiu iniciar uma sessão real.");

  const identityResponse = await apiGet(baseUrl, "/api/v1/auth/me", token);
  const identityPayload = await responseJson(identityResponse);
  if (!identityResponse.ok || identityPayload.ok !== true) throw new Error("A API não confirmou o contexto autenticado.");

  const organizationId = String(identityPayload.data?.organization?.id || "");
  const role = String(
    identityPayload.data?.profile?.commercialRole
    || identityPayload.data?.profile?.commercial_role
    || identityPayload.data?.profile?.role
    || "",
  ).toLowerCase();
  assertUuid("organization_id da sessão", organizationId);
  if (!/(admin|director|diretor)/.test(role)) {
    throw new Error("A medição agregada exige uma conta dedicada de administrador ou diretor.");
  }

  const analyticsResponse = await apiGet(baseUrl, `/api/v1/analytics/lead-intake?days=${periodDays}`, token);
  const analyticsPayload = await responseJson(analyticsResponse);
  if (!analyticsResponse.ok || analyticsPayload.ok !== true) {
    throw new Error(`A leitura agregada não foi confirmada (HTTP ${analyticsResponse.status}).`);
  }

  const data = analyticsPayload.data || {};
  const responseOrganizationId = String(data.scope?.organizationId || "");
  const metric = finiteMetric(data.baseline?.medianFirstActionMinutes);
  const measuredFirstActions = positiveInteger(data.baseline?.firstActionMeasured);
  if (responseOrganizationId !== organizationId) throw new Error("A leitura retornou organização divergente da sessão.");
  if (data.scope?.hierarchyApplied !== true || data.scope?.personalDataReturned !== false) {
    throw new Error("A leitura não confirmou hierarquia aplicada e ausência de dados pessoais.");
  }
  if (metric === null || measuredFirstActions === null) {
    throw new Error("Ainda não há amostra operacional suficiente de primeiras ações para registrar a mediana.");
  }

  const evidence = {
    schema: "atlas.phase-354-lead-intake-after.v1",
    status: "authenticated_after_snapshot_captured",
    capturedAt: new Date().toISOString(),
    source: {
      endpoint: "/api/v1/analytics/lead-intake",
      periodDays,
      aggregateOnly: true,
    },
    metric: {
      medianLeadToFirstActionMinutes: metric,
      measuredFirstActions,
    },
    evidence: {
      authenticatedRead: true,
      tenantScoped: true,
      hierarchyApplied: true,
      personalDataReturned: false,
    },
    safety: {
      remoteMutation: false,
      secretsPrinted: false,
    },
  };
  const evidencePath = await writeJsonAtomically(evidenceFile, evidence);
  console.log(JSON.stringify({
    ...evidence,
    artifact: {
      written: true,
      path: path.relative(process.cwd(), evidencePath) || path.basename(evidencePath),
    },
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    schema: "atlas.phase-354-after-capture-evidence.v1",
    status: "failed_without_remote_mutation",
    artifactWritten: false,
    reason: error instanceof Error ? error.message : "Falha não identificada.",
    safety: { remoteMutation: false, secretsPrinted: false },
  }, null, 2));
  process.exitCode = 1;
} finally {
  await supabase.auth.signOut().catch(() => undefined);
}
