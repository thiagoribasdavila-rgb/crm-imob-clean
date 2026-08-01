import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { metaGraphVersion, describeMetaGraphFailure } from "@/lib/meta/graph";

export const dynamic = "force-dynamic";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

function isDirector(identity: Awaited<ReturnType<typeof requireAccessContext>>) {
  return identity.ok && (identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director");
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 12, windowMs: 60 * 60_000, scope: "whatsapp-health" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(identity)) return apiError("FORBIDDEN", "Diagnóstico oficial do WhatsApp é exclusivo da diretoria.", identity.meta, { status: 403 });

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return apiSuccess({ connected: false, reason: "credentials_missing", safeguards: { credentialsExposed: false } }, identity.meta, { headers: rate.headers });

  try {
    const apiVersion = metaGraphVersion();
    const fields = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,throughput,code_verification_status,platform_type";
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) return apiError("WHATSAPP_GRAPH_ERROR", `A Graph API não confirmou o número configurado. ${describeMetaGraphFailure(response.status, data)}`, identity.meta, { status: 502, headers: rate.headers });
    const qualityRating = String(data.quality_rating || "UNKNOWN").toUpperCase();
    const messagingLimitTier = String(data.messaging_limit_tier || "UNKNOWN").toUpperCase();
    const verificationStatus = String(data.code_verification_status || "UNKNOWN").toUpperCase();
    const requiredFieldsConfirmed = Boolean(data.display_phone_number && data.verified_name && qualityRating !== "UNKNOWN" && messagingLimitTier !== "UNKNOWN");
    const admin = getSupabaseAdmin();
    const [{ data: templates }, { data: tests }] = await Promise.all([
      admin.from("message_templates").select("id,name,language,category,variables").eq("organization_id", identity.access.organization.id).eq("channel", "whatsapp").eq("status", "approved").order("name").limit(50),
      admin.from("messages").select("id,status,sent_at,delivered_at,read_at,error,media,created_at").eq("organization_id", identity.access.organization.id).eq("channel", "whatsapp").eq("direction", "outbound").contains("media", [{ type: "whatsapp_template_test", phase: 28 }]).order("created_at", { ascending: false }).limit(10),
    ]);
    const eligibleTemplates = (templates ?? []).filter((template) => !Array.isArray(template.variables) || template.variables.length === 0).map((template) => ({ id: template.id, name: template.name, language: template.language, category: template.category }));
    return apiSuccess({ connected: true, phone: { idMasked: `••••${phoneNumberId.slice(-4)}`, displayNumber: data.display_phone_number, verifiedName: data.verified_name, qualityRating, messagingLimitTier, throughput: data.throughput, verificationStatus, platformType: data.platform_type }, homologation: { status: requiredFieldsConfirmed ? "passed" : "incomplete", graphConfirmed: true, numberConfirmed: Boolean(data.display_phone_number), qualityConfirmed: qualityRating !== "UNKNOWN", limitConfirmed: messagingLimitTier !== "UNKNOWN", readOnly: true }, templates: eligibleTemplates, templateTests: tests ?? [], testRecipientMasked: process.env.WHATSAPP_TEST_RECIPIENT ? `••••${normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT).slice(-4)}` : null, safeguards: { officialTemplates: true, optOutBeforeSend: true, gradualPacing: true, atomicWorkerClaim: true, webhookHealth: true, credentialsExposed: false }, checkedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });
  } catch {
    return apiError("WHATSAPP_HEALTH_FAILED", "Não foi possível concluir o diagnóstico oficial do WhatsApp.", identity.meta, { status: 502, headers: rate.headers });
  }
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 3, windowMs: 60 * 60_000, scope: "whatsapp-template-test" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(identity)) return apiError("FORBIDDEN", "Ensaio de template do WhatsApp é exclusivo da diretoria.", identity.meta, { status: 403 });
  const body = await request.json().catch(() => null) as { templateId?: string } | null;
  const templateId = String(body?.templateId || "");
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) return apiError("INVALID_TEMPLATE", "Selecione um template aprovado.", identity.meta, { status: 400 });
  const recipient = normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT || "");
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const cronSecret = process.env.ATLAS_CRON_SECRET;
  const baseUrl = (process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
  if (!/^\d{10,15}$/.test(recipient) || !phoneNumberId || !process.env.WHATSAPP_ACCESS_TOKEN || !cronSecret || !/^https:\/\//i.test(baseUrl)) return apiError("WHATSAPP_TEST_NOT_READY", "Configure número de teste, credenciais, worker e URL HTTPS na Hostinger.", identity.meta, { status: 503 });

  const admin = getSupabaseAdmin();
  const [{ data: template }, { data: suppression }, { data: integration }] = await Promise.all([
    admin.from("message_templates").select("id,name,language,body,variables,status").eq("id", templateId).eq("organization_id", identity.access.organization.id).eq("channel", "whatsapp").eq("status", "approved").maybeSingle(),
    admin.from("messaging_suppressions").select("id").eq("organization_id", identity.access.organization.id).eq("channel", "whatsapp").eq("recipient", recipient).maybeSingle(),
    admin.from("integrations").select("id").eq("organization_id", identity.access.organization.id).eq("provider", "whatsapp").eq("external_account_id", phoneNumberId).maybeSingle(),
  ]);
  if (!template || (Array.isArray(template.variables) && template.variables.length > 0)) return apiError("TEMPLATE_NOT_ELIGIBLE", "Use um template aprovado sem variáveis nesta etapa de homologação.", identity.meta, { status: 400 });
  if (suppression) return apiError("RECIPIENT_SUPPRESSED", "O número de teste possui opt-out e não pode receber mensagens.", identity.meta, { status: 409 });
  if (!integration) return apiError("WEBHOOK_MAPPING_MISSING", "Vincule o Phone Number ID à integração da organização antes do ensaio.", identity.meta, { status: 400 });

  try {
    let { data: conversation } = await admin.from("conversations").select("id").eq("organization_id", identity.access.organization.id).eq("channel", "whatsapp").eq("external_thread_id", recipient).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!conversation) {
      const created = await admin.from("conversations").insert({ organization_id: identity.access.organization.id, channel: "whatsapp", external_thread_id: recipient, status: "open", assigned_to: identity.access.profile.id, last_message_at: new Date().toISOString() }).select("id").single();
      if (created.error || !created.data) throw created.error ?? new Error("Falha ao preparar conversa de teste.");
      conversation = created.data;
    }
    const media = [{ type: "whatsapp_template" as const, name: template.name, language: template.language || "pt_BR" }, { type: "whatsapp_template_test" as const, phase: 28, requestedBy: identity.access.profile.id }];
    const { data: message, error: messageError } = await admin.from("messages").insert({ organization_id: identity.access.organization.id, conversation_id: conversation.id, direction: "outbound", channel: "whatsapp", recipient, content: template.body, media, status: "queued" }).select("id").single();
    if (messageError || !message) throw messageError ?? new Error("Falha ao registrar mensagem de teste.");
    const { error: outboxError } = await admin.from("integration_outbox").insert({ organization_id: identity.access.organization.id, topic: "message.send", aggregate_type: "message", aggregate_id: message.id, payload: { messageId: message.id, channel: "whatsapp", homologationPhase: 28 } });
    if (outboxError) throw outboxError;
    let sent: { id: string; status: string; external_message_id: string | null; sent_at: string | null; delivered_at: string | null; read_at: string | null; error: string | null } | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const workerResponse = await fetch(`${baseUrl}/api/v2/outbox/process`, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` }, cache: "no-store" });
      if (!workerResponse.ok) throw new Error(`Worker HTTP ${workerResponse.status}`);
      const result = await admin.from("messages").select("id,status,external_message_id,sent_at,delivered_at,read_at,error").eq("id", message.id).eq("organization_id", identity.access.organization.id).single();
      sent = result.data;
      if (sent?.external_message_id && ["sent", "delivered", "read"].includes(sent.status)) break;
    }
    if (!sent?.external_message_id || !["sent", "delivered", "read"].includes(sent.status)) throw new Error("A API ainda não confirmou o envio do template.");
    return apiSuccess({ status: "sent", messageId: sent.id, externalMessageIdMasked: `••••${sent.external_message_id.slice(-6)}`, template: { name: template.name, language: template.language }, recipientMasked: `••••${recipient.slice(-4)}`, sentAt: sent.sent_at, deliveredAt: sent.delivered_at, readAt: sent.read_at, next: "Abra a mensagem no número de teste e atualize o diagnóstico para comprovar entrega e leitura." }, identity.meta, { status: 202, headers: rate.headers });
  } catch (error) {
    return apiError("WHATSAPP_TEMPLATE_TEST_FAILED", "Não foi possível confirmar o envio do template aprovado.", identity.meta, { status: 502, details: error instanceof Error ? error.message.slice(0, 160) : "Falha" });
  }
}
