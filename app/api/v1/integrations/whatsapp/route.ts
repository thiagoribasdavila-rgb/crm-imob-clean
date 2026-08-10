import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

function isDirector(identity: Awaited<ReturnType<typeof requireAccessContext>>) {
  return identity.ok && (identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director");
}

function isBroker(identity: Awaited<ReturnType<typeof requireAccessContext>>) {
  return identity.ok && identity.access.profile.commercialRole === "broker";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function verifyPhoneNumber(phoneNumberId: string, accessToken: string) {
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  const fields = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,throughput,code_verification_status,platform_type";
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error("A Graph API não confirmou este Phone Number ID. Revise permissões e o número oficial no Meta Business.");
  return data;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 12, windowMs: 60 * 60_000, scope: "whatsapp-health" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const director = isDirector(identity);

  // A linha oficial pertence à operação, não ao WhatsApp pessoal do corretor.
  // Profissionais podem consultar apenas o estado da própria linha; o diagnóstico
  // completo, templates e gestão continuam restritos à diretoria.
  if (!director) {
    const { data: lines, error } = await getSupabaseAdmin()
      .from("integrations")
      .select("status,external_account_id,config,updated_at")
      .eq("organization_id", identity.access.organization.id)
      .eq("provider", "whatsapp")
      .order("updated_at", { ascending: false });
    if (error) return apiError("WHATSAPP_LINE_STATUS_FAILED", "Não foi possível consultar o estado da sua linha oficial.", identity.meta, { status: 502, headers: rate.headers });
    const line = (lines ?? []).find((candidate) => {
      const config = configObject(candidate.config);
      return config.brokerProfileId === identity.access.profile.id;
    });
    const config = configObject(line?.config);
    const configured = Boolean(line && line.status === "connected" && line.external_account_id);
    const pendingApproval = Boolean(line && line.status === "pending_approval");
    return apiSuccess({
      scope: "broker",
      myLine: {
        configured,
        status: configured ? "connected" : pendingApproval ? "pending_approval" : "not_configured",
        displayPhone: typeof config.displayPhone === "string" ? config.displayPhone : null,
        phoneNumberIdMasked: configured || pendingApproval ? `••••${String(line?.external_account_id || "").slice(-4)}` : null,
        recordConversations: configured && config.recordConversations !== false,
        requestedAt: typeof config.requestedAt === "string" ? config.requestedAt : null,
        updatedAt: line?.updated_at ?? null,
      },
      safeguards: { personalWhatsAppRequired: false, conversationsRecordedInCrm: configured && config.recordConversations !== false, credentialsExposed: false },
    }, identity.meta, { headers: rate.headers });
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return apiSuccess({ connected: false, reason: "credentials_missing", safeguards: { credentialsExposed: false } }, identity.meta, { headers: rate.headers });

  try {
    let data: Record<string, unknown>;
    try { data = await verifyPhoneNumber(phoneNumberId, accessToken); }
    catch { return apiError("WHATSAPP_GRAPH_ERROR", "A Graph API não confirmou o número configurado. Revise token, permissões e Phone Number ID.", identity.meta, { status: 502, headers: rate.headers }); }
    const qualityRating = String(data.quality_rating || "UNKNOWN").toUpperCase();
    const messagingLimitTier = String(data.messaging_limit_tier || "UNKNOWN").toUpperCase();
    const verificationStatus = String(data.code_verification_status || "UNKNOWN").toUpperCase();
    const requiredFieldsConfirmed = Boolean(data.display_phone_number && data.verified_name && qualityRating !== "UNKNOWN" && messagingLimitTier !== "UNKNOWN");
    const admin = getSupabaseAdmin();
    const [{ data: templates }, { data: tests }, { data: lines }, { data: profiles }] = await Promise.all([
      admin.from("message_templates").select("id,name,language,category,variables").eq("organization_id", identity.access.organization.id).eq("channel", "whatsapp").eq("status", "approved").order("name").limit(50),
      admin.from("messages").select("id,status,sent_at,delivered_at,read_at,error,media,created_at").eq("organization_id", identity.access.organization.id).eq("channel", "whatsapp").eq("direction", "outbound").contains("media", [{ type: "whatsapp_template_test", phase: 28 }]).order("created_at", { ascending: false }).limit(10),
      admin.from("integrations").select("id,name,external_account_id,status,config,updated_at").eq("organization_id", identity.access.organization.id).eq("provider", "whatsapp").order("created_at"),
      admin.from("profiles").select("id,full_name,commercial_role,role,active").eq("organization_id", identity.access.organization.id).eq("active", true).order("full_name").limit(500),
    ]);
    const eligibleTemplates = (templates ?? []).filter((template) => !Array.isArray(template.variables) || template.variables.length === 0).map((template) => ({ id: template.id, name: template.name, language: template.language, category: template.category }));
    const brokerProfiles = (profiles ?? []).filter((profile) => ["broker", "manager"].includes(String(profile.commercial_role || profile.role))).map((profile) => ({ id: profile.id, name: profile.full_name || "Profissional", role: profile.commercial_role || profile.role }));
    const brokerLines = (lines ?? []).map((line) => {
      const config = configObject(line.config);
      const brokerProfileId = typeof config.brokerProfileId === "string" ? config.brokerProfileId : null;
      const broker = brokerProfiles.find((profile) => profile.id === brokerProfileId);
      return { id: line.id, name: line.name, phoneNumberIdMasked: `••••${String(line.external_account_id || "").slice(-4)}`, displayPhone: typeof config.displayPhone === "string" ? config.displayPhone : null, brokerProfileId, brokerName: broker?.name || null, status: line.status, recordConversations: config.recordConversations !== false, isDefault: config.isDefault === true, requestedAt: typeof config.requestedAt === "string" ? config.requestedAt : null, updatedAt: line.updated_at };
    });
    return apiSuccess({ connected: true, phone: { idMasked: `••••${phoneNumberId.slice(-4)}`, displayNumber: data.display_phone_number, verifiedName: data.verified_name, qualityRating, messagingLimitTier, throughput: data.throughput, verificationStatus, platformType: data.platform_type }, homologation: { status: requiredFieldsConfirmed ? "passed" : "incomplete", graphConfirmed: true, numberConfirmed: Boolean(data.display_phone_number), qualityConfirmed: qualityRating !== "UNKNOWN", limitConfirmed: messagingLimitTier !== "UNKNOWN", readOnly: true }, templates: eligibleTemplates, templateTests: tests ?? [], brokerProfiles, brokerLines, testRecipientMasked: process.env.WHATSAPP_TEST_RECIPIENT ? `••••${normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT).slice(-4)}` : null, safeguards: { officialTemplates: true, optOutBeforeSend: true, gradualPacing: true, atomicWorkerClaim: true, webhookHealth: true, credentialsExposed: false }, checkedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });
  } catch {
    return apiError("WHATSAPP_HEALTH_FAILED", "Não foi possível concluir o diagnóstico oficial do WhatsApp.", identity.meta, { status: 502, headers: rate.headers });
  }
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 10, windowMs: 60 * 60_000, scope: "whatsapp-integration-management" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const body = await request.json().catch(() => null) as { action?: string; templateId?: string; brokerProfileId?: string; phoneNumberId?: string; displayPhone?: string; name?: string } | null;

  // O corretor só registra uma solicitação. A ativação continua exclusiva da
  // diretoria e só acontece após a validação da Graph API.
  if (body?.action === "request_broker_line") {
    if (!isBroker(identity)) return apiError("BROKER_LINE_REQUEST_FORBIDDEN", "Somente corretores podem solicitar o vínculo da própria linha oficial.", identity.meta, { status: 403, headers: rate.headers });
    const phoneNumberId = String(body.phoneNumberId || "").trim();
    const displayPhone = String(body.displayPhone || "").trim().slice(0, 40);
    if (!/^\d{8,32}$/.test(phoneNumberId) || displayPhone.replace(/\D/g, "").length < 8) return apiError("INVALID_BROKER_LINE_REQUEST", "Informe o Phone Number ID da Meta e o número oficial exibido para solicitar a validação.", identity.meta, { status: 400, headers: rate.headers });

    const admin = getSupabaseAdmin();
    const brokerProfileId = identity.access.profile.id;
    const lineName = `whatsapp-broker-${brokerProfileId}`;
    const [{ data: duplicateLines }, { data: previousLine }] = await Promise.all([
      admin.from("integrations").select("id,name,config,status").eq("organization_id", identity.access.organization.id).eq("provider", "whatsapp").eq("external_account_id", phoneNumberId).limit(2),
      admin.from("integrations").select("id,name,config,status").eq("organization_id", identity.access.organization.id).eq("provider", "whatsapp").eq("name", lineName).maybeSingle(),
    ]);
    const duplicateLine = (duplicateLines ?? []).find((line) => line.id !== previousLine?.id);
    if (duplicateLine) return apiError("PHONE_ALREADY_LINKED", "Este Phone Number ID já está vinculado a outro profissional desta organização.", identity.meta, { status: 409, headers: rate.headers });
    if (previousLine?.status === "connected") return apiError("BROKER_LINE_ALREADY_ACTIVE", "Sua linha oficial já está ativa. Para qualquer ajuste, procure a diretoria.", identity.meta, { status: 409, headers: rate.headers });

    const requestedAt = new Date().toISOString();
    const previousConfig = configObject(previousLine?.config);
    const payload = {
      organization_id: identity.access.organization.id,
      provider: "whatsapp",
      name: lineName,
      status: "pending_approval",
      external_account_id: phoneNumberId,
      config: { ...previousConfig, brokerProfileId, displayPhone, label: "Linha solicitada pelo corretor", recordConversations: true, lineType: "broker", requestStatus: "pending_director_approval", requestedAt, requestedBy: brokerProfileId },
      last_error: "Aguardando aprovação da diretoria.",
      last_sync_at: null,
      updated_at: requestedAt,
    };
    const persisted = previousLine
      ? await admin.from("integrations").update(payload).eq("id", previousLine.id).select("id").single()
      : await admin.from("integrations").insert(payload).select("id").single();
    if (persisted.error || !persisted.data) return apiError("BROKER_LINE_REQUEST_FAILED", "Não foi possível registrar sua solicitação de linha.", identity.meta, { status: 502, headers: rate.headers });
    const alert = await admin.from("atlas_events").insert({
      organization_id: identity.access.organization.id,
      event_type: "whatsapp.broker_line_requested",
      source: "whatsapp.broker_profile",
      aggregate_type: "integration",
      aggregate_id: persisted.data.id,
      payload: { brokerProfileId, displayPhone, phoneNumberIdMasked: `••••${phoneNumberId.slice(-4)}`, requestStatus: "pending_director_approval", notifyRole: "director" },
      correlation_id: crypto.randomUUID(),
    });
    if (alert.error) return apiError("BROKER_LINE_ALERT_FAILED", "Sua solicitação foi registrada, mas o aviso para a diretoria não pôde ser criado. Tente novamente.", identity.meta, { status: 502, headers: rate.headers });
    return apiSuccess({ requested: true, directorNotified: true, myLine: { configured: false, status: "pending_approval", displayPhone, phoneNumberIdMasked: `••••${phoneNumberId.slice(-4)}`, recordConversations: false, requestedAt } }, identity.meta, { status: 201, headers: rate.headers });
  }

  if (!isDirector(identity)) return apiError("FORBIDDEN", "A gestão e aprovação de linhas oficiais do WhatsApp é exclusiva da diretoria.", identity.meta, { status: 403, headers: rate.headers });

  if (body?.action === "approve_broker_line") {
    const brokerProfileId = String(body.brokerProfileId || "");
    if (!isUuid(brokerProfileId)) return apiError("INVALID_BROKER", "Corretor inválido.", identity.meta, { status: 400, headers: rate.headers });
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) return apiError("WHATSAPP_CREDENTIALS_MISSING", "A credencial oficial do WhatsApp não está configurada na Hostinger.", identity.meta, { status: 503, headers: rate.headers });
    const admin = getSupabaseAdmin();
    const { data: pendingLine, error: pendingLineError } = await admin.from("integrations").select("id,external_account_id,config,status").eq("organization_id", identity.access.organization.id).eq("provider", "whatsapp").eq("name", `whatsapp-broker-${brokerProfileId}`).maybeSingle();
    if (pendingLineError || !pendingLine || pendingLine.status !== "pending_approval" || !/^\d{8,32}$/.test(String(pendingLine.external_account_id || ""))) return apiError("BROKER_LINE_NOT_PENDING", "Nenhuma solicitação pendente foi encontrada para este corretor.", identity.meta, { status: 409, headers: rate.headers });
    try {
      const confirmed = await verifyPhoneNumber(pendingLine.external_account_id, accessToken);
      const approvedAt = new Date().toISOString();
      const config = configObject(pendingLine.config);
      const { error } = await admin.from("integrations").update({ status: "connected", config: { ...config, displayPhone: typeof config.displayPhone === "string" && config.displayPhone ? config.displayPhone : String(confirmed.display_phone_number || ""), requestStatus: "approved", approvedAt, approvedBy: identity.access.profile.id }, last_error: null, last_sync_at: approvedAt, updated_at: approvedAt }).eq("id", pendingLine.id);
      if (error) throw error;
      await admin.from("atlas_events").insert({ organization_id: identity.access.organization.id, event_type: "whatsapp.broker_line_approved", source: "whatsapp.director", aggregate_type: "integration", aggregate_id: pendingLine.id, payload: { brokerProfileId, approvedBy: identity.access.profile.id, notifyRole: "broker" }, correlation_id: crypto.randomUUID() });
      return apiSuccess({ approved: true, brokerProfileId, phoneNumberIdMasked: `••••${pendingLine.external_account_id.slice(-4)}`, recordingEnabled: true }, identity.meta, { headers: rate.headers });
    } catch (error) { return apiError("BROKER_LINE_NOT_CONFIRMED", error instanceof Error ? error.message : "Não foi possível validar a linha oficial na Meta.", identity.meta, { status: 502, headers: rate.headers }); }
  }

  if (body?.action === "save_broker_line") {
    const brokerProfileId = String(body.brokerProfileId || "");
    const phoneNumberId = String(body.phoneNumberId || "").trim();
    const displayPhone = String(body.displayPhone || "").trim().slice(0, 40);
    const name = String(body.name || "Linha do corretor").trim().slice(0, 80);
    if (!isUuid(brokerProfileId) || !/^\d{8,32}$/.test(phoneNumberId)) return apiError("INVALID_BROKER_LINE", "Selecione um corretor e informe um Phone Number ID válido.", identity.meta, { status: 400 });
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) return apiError("WHATSAPP_CREDENTIALS_MISSING", "A credencial oficial do WhatsApp não está configurada na Hostinger.", identity.meta, { status: 503 });
    const admin = getSupabaseAdmin();
    const lineName = `whatsapp-broker-${brokerProfileId}`;
    const [{ data: broker }, { data: duplicateLines }, { data: previousLine }] = await Promise.all([
      admin.from("profiles").select("id,commercial_role,role,active").eq("id", brokerProfileId).eq("organization_id", identity.access.organization.id).maybeSingle(),
      admin.from("integrations").select("id,name,config").eq("organization_id", identity.access.organization.id).eq("provider", "whatsapp").eq("external_account_id", phoneNumberId).limit(2),
      admin.from("integrations").select("id,name,config").eq("organization_id", identity.access.organization.id).eq("provider", "whatsapp").eq("name", lineName).maybeSingle(),
    ]);
    if (!broker?.active || !["broker", "manager"].includes(String(broker.commercial_role || broker.role))) return apiError("BROKER_NOT_ELIGIBLE", "Selecione um corretor ou gerente ativo desta organização.", identity.meta, { status: 409 });
    const duplicateLine = (duplicateLines ?? []).find((line) => line.id !== previousLine?.id);
    if (duplicateLine) return apiError("PHONE_ALREADY_LINKED", "Este Phone Number ID já está vinculado a outro profissional desta organização.", identity.meta, { status: 409 });
    try {
      const confirmed = await verifyPhoneNumber(phoneNumberId, accessToken);
      const previousConfig = configObject(previousLine?.config);
      const payload = { organization_id: identity.access.organization.id, provider: "whatsapp", name: lineName, status: "connected", external_account_id: phoneNumberId, config: { ...previousConfig, brokerProfileId, displayPhone: displayPhone || String(confirmed.display_phone_number || ""), label: name, recordConversations: true, lineType: "broker", requestStatus: "approved", approvedAt: new Date().toISOString(), approvedBy: identity.access.profile.id }, last_error: null, last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const { error } = previousLine
        ? await admin.from("integrations").update(payload).eq("id", previousLine.id)
        : await admin.from("integrations").insert(payload);
      if (error) throw error;
      return apiSuccess({ saved: true, brokerProfileId, phoneNumberIdMasked: `••••${phoneNumberId.slice(-4)}`, displayPhone: displayPhone || confirmed.display_phone_number || null, recordingEnabled: true }, identity.meta, { status: 201, headers: rate.headers });
    } catch (error) { return apiError("BROKER_LINE_NOT_CONFIRMED", error instanceof Error ? error.message : "Não foi possível validar a linha oficial na Meta.", identity.meta, { status: 502 }); }
  }
  if (body?.action === "disconnect_broker_line") {
    const brokerProfileId = String(body.brokerProfileId || "");
    if (!isUuid(brokerProfileId)) return apiError("INVALID_BROKER", "Corretor inválido.", identity.meta, { status: 400 });
    const { error } = await getSupabaseAdmin().from("integrations").update({ status: "disconnected", last_error: "Desconectado pela diretoria.", updated_at: new Date().toISOString() }).eq("name", `whatsapp-broker-${brokerProfileId}`).eq("organization_id", identity.access.organization.id).eq("provider", "whatsapp");
    if (error) return apiError("DISCONNECT_FAILED", "Não foi possível desconectar a linha.", identity.meta, { status: 502 });
    return apiSuccess({ disconnected: true }, identity.meta, { headers: rate.headers });
  }
  if (body?.action !== "whatsapp-template-test") {
    return apiError(
      "FORBIDDEN",
      "Ensaio de template do WhatsApp é exclusivo da diretoria.",
      identity.meta,
      { status: 403, headers: rate.headers },
    );
  }
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
