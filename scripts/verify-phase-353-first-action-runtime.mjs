import process from "node:process";
import path from "node:path";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const CONFIRMATION = "phase-353-first-action";

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
    throw new Error(`${name} precisa ser um UUID válido e previamente designado.`);
  }
}

function assertFutureTimestamp(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now() + 5 * 60_000) {
    throw new Error("ATLAS_RUNTIME_NEXT_ACTION_AT deve ser ISO-8601 e estar ao menos 5 minutos no futuro.");
  }
  return new Date(timestamp).toISOString();
}

function shortId(value) {
  return typeof value === "string" && value.length >= 8 ? `${value.slice(0, 8)}…` : "indisponível";
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

async function json(response) {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw new Error(`Resposta inválida (HTTP ${response.status}).`);
  return payload;
}

async function apiRequest(baseUrl, path, accessToken, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Request-Id": crypto.randomUUID(),
      "X-Correlation-Id": crypto.randomUUID(),
      ...(init.headers || {}),
    },
    redirect: "manual",
  });
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
const leadId = required("ATLAS_RUNTIME_TEST_LEAD_ID", process.env.ATLAS_RUNTIME_TEST_LEAD_ID, missing);
const nextActionInput = required("ATLAS_RUNTIME_NEXT_ACTION_AT", process.env.ATLAS_RUNTIME_NEXT_ACTION_AT, missing);
const evidenceFile = process.env.ATLAS_PHASE_353_EVIDENCE_FILE
  || "artifacts/runtime/phase-353/first-action-evidence.json";

if (missing.length > 0 || process.env.ATLAS_RUNTIME_MUTATION_CONFIRM !== CONFIRMATION) {
  console.log(JSON.stringify({
    schema: "atlas.phase-353-runtime-preflight.v1",
    status: "blocked_without_mutation",
    missing,
    confirmationAccepted: process.env.ATLAS_RUNTIME_MUTATION_CONFIRM === CONFIRMATION,
    requiredConfirmation: `ATLAS_RUNTIME_MUTATION_CONFIRM=${CONFIRMATION}`,
    safety: {
      arbitraryLeadSelection: false,
      mutationAttempted: false,
      secretsPrinted: false,
    },
  }, null, 2));
  process.exit(2);
}

const baseUrl = safeBaseUrl(rawBaseUrl);
assertUuid("ATLAS_RUNTIME_TEST_LEAD_ID", leadId);
const nextActionAt = assertFutureTimestamp(nextActionInput);
const idempotencyKey = `phase-353-first-action-${leadId}`;
const supabase = createClient(supabaseUrl, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let mutationAttempted = false;

try {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  const token = authData.session?.access_token;
  if (authError || !token) throw new Error("A conta de homologação não conseguiu iniciar uma sessão real.");

  const identityResponse = await apiRequest(baseUrl, "/api/v1/auth/me", token, { method: "GET" });
  const identityPayload = await json(identityResponse);
  if (!identityResponse.ok || identityPayload.ok !== true) throw new Error("A API não confirmou o contexto autenticado.");

  const role = String(identityPayload.data?.profile?.role || "").toUpperCase();
  const organizationId = String(identityPayload.data?.organization?.id || "");
  if (!/(BROKER|CORRETOR)/.test(role)) throw new Error("A prova exige uma conta de corretor dedicada à homologação.");
  assertUuid("organization_id da sessão", organizationId);

  const { data: visibleLead, error: visibleLeadError } = await supabase
    .from("leads")
    .select("id,organization_id,status,next_action_at,last_interaction_at")
    .eq("id", leadId)
    .maybeSingle();
  if (visibleLeadError || !visibleLead) throw new Error("A lead designada não está visível para o corretor pelo RLS.");
  if (visibleLead.organization_id !== organizationId) throw new Error("A lead designada não pertence à organização resolvida.");

  const payload = {
    actionType: "contact",
    outcome: "follow_up_needed",
    note: "Validação controlada da primeira ação na fase 353.",
    nextActionTitle: "Revisar retorno da validação controlada",
    nextActionAt,
    humanConfirmed: true,
  };

  mutationAttempted = true;
  const firstResponse = await apiRequest(baseUrl, `/api/v1/leads/${leadId}/first-action`, token, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
  const firstPayload = await json(firstResponse);
  if (![200, 201].includes(firstResponse.status) || firstPayload.ok !== true) {
    throw new Error(`A gravação atômica não foi confirmada (HTTP ${firstResponse.status}).`);
  }
  const first = firstPayload.data || {};
  assertUuid("activityId", String(first.activityId || ""));
  assertUuid("taskId", String(first.taskId || ""));

  const [activityResult, taskResult, leadResult, eventResult] = await Promise.all([
    supabase.from("activities").select("id,lead_id,organization_id,metadata").eq("id", first.activityId).maybeSingle(),
    supabase.from("tasks").select("id,lead_id,organization_id,due_date,status,metadata").eq("id", first.taskId).maybeSingle(),
    supabase.from("leads").select("id,organization_id,status,next_action_at,last_interaction_at").eq("id", leadId).maybeSingle(),
    supabase.from("lead_events").select("id,lead_id,organization_id,event_type,metadata").eq("lead_id", leadId).eq("event_type", "first_action_recorded").order("created_at", { ascending: false }).limit(20),
  ]);
  if (activityResult.error || !activityResult.data) throw new Error("A atividade persistida não ficou legível pelo RLS do corretor.");
  if (taskResult.error || !taskResult.data) throw new Error("A tarefa persistida não ficou legível pelo RLS do corretor.");
  if (leadResult.error || !leadResult.data) throw new Error("A atualização da lead não ficou legível pelo RLS do corretor.");
  const matchingEvent = (eventResult.data || []).find((row) => row.metadata?.idempotencyKey === idempotencyKey);
  if (eventResult.error || !matchingEvent) throw new Error("O evento auditável não ficou legível pelo RLS do corretor.");
  for (const row of [activityResult.data, taskResult.data, leadResult.data, matchingEvent]) {
    if (row.organization_id !== organizationId || row.lead_id && row.lead_id !== leadId) {
      throw new Error("A persistência retornou um registro fora do escopo esperado.");
    }
  }

  const replayResponse = await apiRequest(baseUrl, `/api/v1/leads/${leadId}/first-action`, token, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
  const replayPayload = await json(replayResponse);
  const replay = replayPayload.data || {};
  if (replayResponse.status !== 200 || replayPayload.ok !== true || replay.replayed !== true) {
    throw new Error("A segunda chamada não foi reconhecida como replay idempotente.");
  }
  if (replay.activityId !== first.activityId || replay.taskId !== first.taskId) {
    throw new Error("O replay criou ou retornou identificadores divergentes.");
  }

  const evidence = {
    schema: "atlas.phase-353-runtime-evidence.v1",
    status: "authenticated_first_action_proved",
    baseUrlOrigin: new URL(baseUrl).origin,
    role,
    organization: shortId(organizationId),
    lead: shortId(leadId),
    evidence: {
      authenticatedSession: true,
      tenantScopedLeadVisible: true,
      atomicEndpointStatus: firstResponse.status,
      activityPersisted: shortId(first.activityId),
      taskPersisted: shortId(first.taskId),
      leadUpdated: Boolean(leadResult.data.last_interaction_at && leadResult.data.next_action_at),
      auditEventPersisted: shortId(matchingEvent.id),
      replayStatus: replayResponse.status,
      replayedWithoutDuplication: true,
    },
    safety: {
      designatedLeadOnly: true,
      humanConfirmation: true,
      idempotencyKeyStable: true,
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
    schema: "atlas.phase-353-runtime-evidence.v1",
    status: "failed",
    mutationAttempted,
    reason: error instanceof Error ? error.message : "Falha não identificada.",
    secretsPrinted: false,
  }, null, 2));
  process.exitCode = 1;
} finally {
  await supabase.auth.signOut().catch(() => undefined);
}
