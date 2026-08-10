import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { hashMetaValue, queueMetaConversion } from "@/lib/meta/conversions";
import { resilientFetch } from "@/lib/http/resilient-fetch";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(secret && token && token === secret);
}

type WhatsAppTemplate = { name: string; language: string };

type WhatsAppBrokerLine = {
  phoneNumberId: string;
  integrationId: string | null;
  brokerProfileId: string | null;
  displayPhone: string | null;
};

function integrationConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function resolveWhatsAppLine(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  assignedTo: string | null,
): Promise<WhatsAppBrokerLine> {
  const fallbackPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const { data: lines, error } = await admin
    .from("integrations")
    .select("id,external_account_id,config,status")
    .eq("organization_id", organizationId)
    .eq("provider", "whatsapp")
    .eq("status", "connected");
  if (error) throw error;

  const parsed = (lines ?? []).map((line) => ({
    id: line.id as string,
    phoneNumberId: String(line.external_account_id || ""),
    config: integrationConfig(line.config),
  })).filter((line) => /^\d+$/.test(line.phoneNumberId));
  const personalLine = assignedTo
    ? parsed.find((line) => line.config.brokerProfileId === assignedTo && line.config.recordConversations !== false)
    : null;
  const defaultLine = parsed.find((line) => line.config.isDefault === true)
    || parsed.find((line) => line.phoneNumberId === fallbackPhoneNumberId);
  const selected = personalLine || defaultLine;
  if (!selected) throw new Error("Nenhuma linha oficial do WhatsApp está vinculada a este corretor. A diretoria deve conectá-la em Integrações.");
  return {
    phoneNumberId: selected.phoneNumberId,
    integrationId: selected.id,
    brokerProfileId: typeof selected.config.brokerProfileId === "string" ? selected.config.brokerProfileId : null,
    displayPhone: typeof selected.config.displayPhone === "string" ? selected.config.displayPhone : null,
  };
}

async function deliverWhatsApp(phoneNumberId: string, recipient: string, content: string, template?: WhatsAppTemplate) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  if (!phoneNumberId || !accessToken) throw new Error("Credenciais do WhatsApp não configuradas.");

  const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(template
      ? { messaging_product: "whatsapp", to: recipient, type: "template", template: { name: template.name, language: { code: template.language } } }
      : { messaging_product: "whatsapp", to: recipient, type: "text", text: { body: content } }),
  }, { timeoutMs: 30_000, retries: 0, operation: "WhatsApp" });

  const data = (await response.json()) as { messages?: Array<{ id: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `WhatsApp HTTP ${response.status}`);
  return data.messages?.[0]?.id ?? null;
}

async function fetchMetaLead(externalLeadId: string) {
  const accessToken = process.env.META_LEAD_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  if (!accessToken) throw new Error("META_LEAD_ACCESS_TOKEN não configurado.");
  const fields = "id,created_time,ad_id,adset_id,campaign_id,form_id,field_data";
  const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(externalLeadId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}` } }, { timeoutMs: 30_000, retries: 2, operation: "Meta Lead Ads" });
  const data = await response.json() as { id?: string; created_time?: string; ad_id?: string; adset_id?: string; campaign_id?: string; form_id?: string; field_data?: Array<{ name: string; values?: string[] }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `Meta Graph HTTP ${response.status}`);
  return data;
}

function metaField(fields: Array<{ name: string; values?: string[] }> | undefined, ...names: string[]) {
  const wanted = new Set(names);
  return fields?.find((field) => wanted.has(field.name))?.values?.[0]?.trim() || null;
}

function normalizeMetaPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

type ExistingLead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  metadata: unknown;
};

type LeadMatchMethod =
  | "same_meta_event"
  | "email"
  | "phone"
  | "email_and_phone"
  | "identity_conflict"
  | "none";

function isMissingCanonicalColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || /(?:email|phone)_normalized/i.test(error?.message || "");
}

function leadMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function findExistingLead(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  externalLeadId: string,
  email: string | null,
  phone: string | null,
): Promise<{ lead: ExistingLead | null; method: LeadMatchMethod }> {
  const fields = "id,name,email,phone,metadata";
  const { data: sameMetaEvent, error: sameMetaEventError } = await admin
    .from("leads")
    .select(fields)
    .eq("organization_id", organizationId)
    .contains("metadata", { meta: { externalLeadId } })
    .maybeSingle();
  if (sameMetaEventError) throw sameMetaEventError;
  if (sameMetaEvent) return { lead: sameMetaEvent as ExistingLead, method: "same_meta_event" };

  const normalizedEmail = email?.trim().toLowerCase() || null;
  const normalizedPhone = phone ? normalizeMetaPhone(phone) : null;
  if (!normalizedEmail && !normalizedPhone) return { lead: null, method: "none" };

  const lookups = await Promise.all([
    normalizedEmail
      ? admin.from("leads").select(fields).eq("organization_id", organizationId).eq("email_normalized", normalizedEmail).limit(2)
      : Promise.resolve({ data: [], error: null }),
    normalizedPhone
      ? admin.from("leads").select(fields).eq("organization_id", organizationId).eq("phone_normalized", normalizedPhone).limit(2)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const [emailLookup, phoneLookup] = lookups;
  const canonicalUnavailable = isMissingCanonicalColumn(emailLookup.error) || isMissingCanonicalColumn(phoneLookup.error);
  if (!canonicalUnavailable && (emailLookup.error || phoneLookup.error)) throw emailLookup.error || phoneLookup.error;

  let emailMatches = (emailLookup.data || []) as ExistingLead[];
  let phoneMatches = (phoneLookup.data || []) as ExistingLead[];
  if (canonicalUnavailable) {
    const [emailFallback, phoneFallback] = await Promise.all([
      normalizedEmail
        ? admin.from("leads").select(fields).eq("organization_id", organizationId).ilike("email", normalizedEmail).limit(2)
        : Promise.resolve({ data: [], error: null }),
      phone
        ? admin.from("leads").select(fields).eq("organization_id", organizationId).eq("phone", phone).limit(2)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (emailFallback.error || phoneFallback.error) throw emailFallback.error || phoneFallback.error;
    emailMatches = (emailFallback.data || []) as ExistingLead[];
    phoneMatches = (phoneFallback.data || []) as ExistingLead[];
  }

  const candidates = new Map<string, ExistingLead>();
  for (const item of [...emailMatches, ...phoneMatches]) candidates.set(item.id, item);
  if (candidates.size > 1) return { lead: null, method: "identity_conflict" };
  const lead = candidates.values().next().value as ExistingLead | undefined;
  if (!lead) return { lead: null, method: "none" };
  return {
    lead,
    method: emailMatches.some((item) => item.id === lead.id) && phoneMatches.some((item) => item.id === lead.id)
      ? "email_and_phone"
      : emailMatches.some((item) => item.id === lead.id)
        ? "email"
        : "phone",
  };
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const workerId = `hostinger-${crypto.randomUUID()}`;
  const admin = getSupabaseAdmin();
  const { data: events, error } = await admin
    .from("integration_outbox")
    .select("id,organization_id,topic,aggregate_id,payload,attempts")
    .in("status", ["pending", "failed"])
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let delivered = 0;
  let failed = 0;

  for (const event of events ?? []) {
    const attempts = Number(event.attempts || 0) + 1;
    const { data: claimed } = await admin.from("integration_outbox").update({ status: "processing", attempts, locked_at: new Date().toISOString(), locked_by: workerId }).eq("id", event.id).in("status", ["pending", "failed"]).select("id").maybeSingle();
    if (!claimed) continue;

    try {
      const now = new Date().toISOString();
      if (event.topic === "message.send" && event.aggregate_id) {
        const { data: message, error: messageError } = await admin.from("messages").select("id,conversation_id,channel,recipient,content,media").eq("id", event.aggregate_id).single();
        if (messageError || !message) throw messageError ?? new Error("Mensagem não encontrada.");
        if (message.channel !== "whatsapp") throw new Error(`Canal ainda não conectado ao worker: ${message.channel}`);
        const { data: conversation, error: conversationError } = await admin
          .from("conversations")
          .select("id,assigned_to,lead_id")
          .eq("id", message.conversation_id)
          .eq("organization_id", event.organization_id)
          .maybeSingle();
        if (conversationError || !conversation) throw conversationError ?? new Error("Conversa não encontrada para selecionar a linha oficial.");
        const normalizedRecipient = String(message.recipient || "").replace(/\D/g, "");
        const { data: universalSuppression } = await admin.from("messaging_suppressions").select("id").eq("organization_id", event.organization_id).eq("channel", "whatsapp").eq("recipient", normalizedRecipient).maybeSingle();
        if (universalSuppression) {
          await Promise.all([admin.from("messages").update({ status: "failed", error: "Contato bloqueado por opt-out." }).eq("id", message.id), admin.from("integration_outbox").update({ status: "blocked", delivered_at: now, last_error: "Bloqueado por opt-out antes do envio." }).eq("id", event.id)]);
          continue;
        }
        const media = Array.isArray(message.media) ? message.media : [];
        const templateItem = media.find((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "whatsapp_template") as { name?: string; language?: string; batchId?: string } | undefined;
        if (templateItem?.batchId) {
          const [{ data: batch }, { data: suppression }] = await Promise.all([
            admin.from("lead_reactivation_batches").select("status,quality_status").eq("id", templateItem.batchId).eq("organization_id", event.organization_id).single(),
            admin.from("messaging_suppressions").select("id").eq("organization_id", event.organization_id).eq("channel", "whatsapp").eq("recipient", message.recipient).maybeSingle(),
          ]);
          if (!batch || !["queued", "running"].includes(batch.status) || batch.quality_status === "red") {
            await admin.from("integration_outbox").update({ status: "pending", available_at: new Date(Date.now() + 60 * 60_000).toISOString(), last_error: "Campanha pausada por governança ou qualidade." }).eq("id", event.id);
            continue;
          }
          if (suppression) {
            await Promise.all([
              admin.from("messages").update({ status: "failed", error: "Contato bloqueado por opt-out." }).eq("id", message.id),
              admin.from("lead_reactivation_contacts").update({ status: "blocked", block_reason: "opt_out" }).eq("batch_id", templateItem.batchId).eq("message_id", message.id),
              admin.from("integration_outbox").update({ status: "delivered", delivered_at: now, last_error: "Bloqueado por opt-out antes do envio." }).eq("id", event.id),
            ]);
            continue;
          }
        }
        const template = templateItem?.name ? { name: templateItem.name, language: templateItem.language || "pt_BR" } : undefined;
        const line = await resolveWhatsAppLine(admin, event.organization_id, conversation.assigned_to || null);
        const existingMedia = Array.isArray(message.media) ? message.media : [];
        const externalMessageId = await deliverWhatsApp(line.phoneNumberId, message.recipient, message.content, template);
        await admin.from("messages").update({
          status: "sent",
          sent_at: now,
          external_message_id: externalMessageId,
          sender: line.displayPhone || line.phoneNumberId,
          media: [...existingMedia, { type: "whatsapp_cloud_line", integrationId: line.integrationId, phoneNumberId: line.phoneNumberId, brokerProfileId: line.brokerProfileId, recorded: true }],
          error: null,
        }).eq("id", message.id);
        if (templateItem?.batchId) {
          await admin.from("lead_reactivation_contacts").update({ status: "sent" }).eq("batch_id", templateItem.batchId).eq("message_id", message.id);
          const { count: remaining } = await admin.from("lead_reactivation_contacts").select("id", { count: "exact", head: true }).eq("batch_id", templateItem.batchId).in("status", ["pending_approval", "queued"]);
          await admin.from("lead_reactivation_batches").update({ status: remaining ? "running" : "completed", updated_at: now }).eq("id", templateItem.batchId);
        }
      } else if (event.topic === "meta.lead.fetch" && event.aggregate_id) {
        const { data: metaEvent, error: metaError } = await admin.from("meta_lead_events").select("id,organization_id,source_id,external_lead_id,status,page_id,form_id,ad_id,adset_id,campaign_external_id").eq("id", event.aggregate_id).single();
        if (metaError || !metaEvent) throw metaError ?? new Error("Evento Meta não encontrado.");
        if (metaEvent.status !== "imported") {
          await admin.from("meta_lead_events").update({ status: "processing", last_error: null }).eq("id", metaEvent.id);
          const [leadData, sourceResult] = await Promise.all([
            fetchMetaLead(metaEvent.external_lead_id),
            admin.from("meta_lead_sources").select("default_owner_id,name,conversion_sharing_enabled,consent_basis").eq("id", metaEvent.source_id).single(),
          ]);
          const fields = leadData.field_data;
          const name = metaField(fields, "full_name", "name") || [metaField(fields, "first_name"), metaField(fields, "last_name")].filter(Boolean).join(" ") || "Lead Meta";
          const email = metaField(fields, "email");
          const phone = metaField(fields, "phone_number", "phone");
          const match = await findExistingLead(admin, metaEvent.organization_id, metaEvent.external_lead_id, email, phone);
          if (match.method === "identity_conflict") {
            throw new Error("Lead Meta com e-mail e telefone associados a clientes diferentes; revisão humana necessária.");
          }
          const metaTracking = {
            externalLeadId: metaEvent.external_lead_id,
            pageId: metaEvent.page_id,
            formId: leadData.form_id || metaEvent.form_id,
            adId: leadData.ad_id || metaEvent.ad_id,
            adsetId: leadData.adset_id || metaEvent.adset_id,
            campaignId: leadData.campaign_id || metaEvent.campaign_external_id,
            sourceName: sourceResult.data?.name || null,
            dataSharingConsent: sourceResult.data?.conversion_sharing_enabled === true,
            consentBasis: sourceResult.data?.consent_basis || null,
            lastSyncedAt: now,
            crmSync: match.lead ? "updated_existing_lead" : "created_new_lead",
            matchMethod: match.method,
          };
          const leadInsert = match.lead
            ? match.method === "same_meta_event"
              ? { data: { id: match.lead.id }, error: null }
              : await admin.from("leads").update({
                name: match.lead.name?.trim() || name,
                email: match.lead.email?.trim() || email,
                phone: match.lead.phone?.trim() || phone,
                last_interaction_at: now,
                updated_at: now,
                metadata: {
                  ...leadMetadata(match.lead.metadata),
                  meta: {
                    ...leadMetadata(leadMetadata(match.lead.metadata).meta),
                    ...metaTracking,
                  },
                },
              }).eq("id", match.lead.id).eq("organization_id", metaEvent.organization_id).select("id").single()
            : await admin.from("leads").insert({
              organization_id: metaEvent.organization_id,
              name,
              email,
              phone,
              source: "Meta Lead Ads",
              status: "novo",
              temperature: "frio",
              score: 0,
              assigned_to: sourceResult.data?.default_owner_id || null,
              metadata: { meta: metaTracking },
              created_at: leadData.created_time || now,
              next_action_at: new Date(Date.now() + 5 * 60_000).toISOString(),
            }).select("id").single();
          const { data: lead, error: leadError } = leadInsert;
          if (leadError || !lead) throw leadError ?? new Error("Falha ao criar lead Meta.");
          await Promise.all([
            admin.from("meta_lead_events").update({ status: "imported", lead_id: lead.id, processed_at: now, last_error: null }).eq("id", metaEvent.id),
            admin.from("campaign_events").insert({ organization_id: metaEvent.organization_id, lead_id: lead.id, event_type: "lead_created", source: "meta", external_event_id: metaEvent.external_lead_id, payload: { ...metaTracking, crmRecord: match.lead ? "updated" : "created" }, occurred_at: leadData.created_time || now }),
          ]);
          await queueMetaConversion({ organizationId: metaEvent.organization_id, leadId: lead.id, eventName: "Lead", eventId: `meta-lead-${metaEvent.external_lead_id}`, occurredAt: leadData.created_time || now, customData: { campaign_id: leadData.campaign_id || metaEvent.campaign_external_id, form_id: leadData.form_id || metaEvent.form_id } });
        }
      } else if (event.topic === "meta.conversion.send" && event.aggregate_id) {
        const [{ data: conversion, error: conversionError }, { data: config, error: configError }] = await Promise.all([
          admin.from("meta_conversion_events").select("id,organization_id,lead_id,event_name,event_id,action_source,custom_data,occurred_at,status,attempts").eq("id", event.aggregate_id).single(),
          admin.from("meta_conversion_configs").select("dataset_id,mode,enabled,test_event_code,consent_required").eq("organization_id", event.organization_id).single(),
        ]);
        if (conversionError || !conversion) throw conversionError ?? new Error("Evento de conversão não encontrado.");
        if (configError || !config) throw configError ?? new Error("Configuração de conversão não encontrada.");
        if (!config.enabled || config.mode !== "test" || !config.test_event_code) throw new Error("Conversões Meta permanecem bloqueadas fora do modo de teste.");
        const accessToken = process.env.META_CONVERSIONS_ACCESS_TOKEN;
        if (!accessToken) throw new Error("META_CONVERSIONS_ACCESS_TOKEN não configurado.");
        const { data: lead, error: leadError } = await admin.from("leads").select("id,email,phone,metadata").eq("id", conversion.lead_id).eq("organization_id", conversion.organization_id).single();
        if (leadError || !lead) throw leadError ?? new Error("Lead da conversão não encontrado.");
        const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
        const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
        if (config.consent_required && meta.dataSharingConsent !== true) throw new Error("Compartilhamento bloqueado: consentimento não registrado.");
        const userData: { em?: string[]; ph?: string[]; external_id: string[]; fbc?: string; fbp?: string } = { external_id: [hashMetaValue(`atlas:${conversion.organization_id}:${lead.id}`)] };
        if (lead.email) userData.em = [hashMetaValue(lead.email)];
        if (lead.phone) {
          const phone = normalizeMetaPhone(lead.phone);
          if (phone) userData.ph = [hashMetaValue(phone)];
        }
        if (typeof meta.fbc === "string" && /^fb\.1\.\d{10,}\.\w+$/i.test(meta.fbc)) userData.fbc = meta.fbc.slice(0, 255);
        if (typeof meta.fbp === "string" && /^fb\.1\.\d{10,}\.\w+$/i.test(meta.fbp)) userData.fbp = meta.fbp.slice(0, 255);
        if (!userData.em && !userData.ph) throw new Error("Conversão sem e-mail ou telefone consentido para correspondência.");
        await admin.from("meta_conversion_events").update({ status: "processing", attempts: Number(conversion.attempts || 0) + 1, last_error: null }).eq("id", conversion.id);
        const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
        const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(config.dataset_id)}/events`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ data: [{ event_name: conversion.event_name, event_time: Math.floor(new Date(conversion.occurred_at).getTime() / 1000), event_id: conversion.event_id, action_source: conversion.action_source, user_data: userData, custom_data: { ...conversion.custom_data, atlas_signal_version: "andromeda-v1" } }], test_event_code: config.test_event_code }),
        }, { timeoutMs: 30_000, retries: 1, retryUnsafe: true, operation: "Meta Conversions API" });
        const metaResponse = await response.json() as Record<string, unknown>;
        if (!response.ok) throw new Error(typeof metaResponse.error === "object" && metaResponse.error ? String((metaResponse.error as { message?: unknown }).message || `Meta HTTP ${response.status}`) : `Meta HTTP ${response.status}`);
        await admin.from("meta_conversion_events").update({ status: "delivered", delivered_at: now, meta_response: metaResponse, last_error: null }).eq("id", conversion.id);
      } else {
        throw new Error(`Tópico não suportado: ${event.topic}`);
      }

      await admin.from("integration_outbox").update({ status: "delivered", delivered_at: now, last_error: null }).eq("id", event.id);
      delivered += 1;
    } catch (processingError) {
      const message = processingError instanceof Error ? processingError.message : "Falha desconhecida";
      const terminal = attempts >= 5;
      const nextAttempt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();

      await admin.from("integration_outbox").update({ status: terminal ? "dead_letter" : "failed", available_at: nextAttempt, last_error: message }).eq("id", event.id);
      if (event.topic === "meta.lead.fetch" && event.aggregate_id) await admin.from("meta_lead_events").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
      if (event.topic === "meta.conversion.send" && event.aggregate_id) await admin.from("meta_conversion_events").update({ status: terminal ? "dead_letter" : "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
      const reactivationBatchId = event.payload && typeof event.payload === "object" ? String((event.payload as { reactivationBatchId?: unknown }).reactivationBatchId || "") : "";
      if (terminal && reactivationBatchId && event.aggregate_id) {
        await admin.from("lead_reactivation_contacts").update({ status: "failed", block_reason: message.slice(0, 500) }).eq("batch_id", reactivationBatchId).eq("message_id", event.aggregate_id);
      }
      if (terminal) {
        await admin.from("dead_letter_events").insert({
          organization_id: event.organization_id,
          outbox_event_id: event.id,
          topic: event.topic,
          payload: event.payload,
          error_message: message,
          attempts,
        });
      }
      failed += 1;
      logger.error("outbox.delivery_failed", processingError, { eventId: event.id, topic: event.topic, attempts });
    }
  }

  return NextResponse.json({ workerId, processed: (events ?? []).length, delivered, failed });
}
