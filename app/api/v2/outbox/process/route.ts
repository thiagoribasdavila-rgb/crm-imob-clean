import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { hashMetaValue, queueMetaConversion } from "@/lib/meta/conversions";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(secret && token && token === secret);
}

async function deliverWhatsApp(recipient: string, content: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  if (!phoneNumberId || !accessToken) throw new Error("Credenciais do WhatsApp não configuradas.");

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: recipient, type: "text", text: { body: content } }),
  });

  const data = (await response.json()) as { messages?: Array<{ id: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `WhatsApp HTTP ${response.status}`);
  return data.messages?.[0]?.id ?? null;
}

async function fetchMetaLead(externalLeadId: string) {
  const accessToken = process.env.META_LEAD_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  if (!accessToken) throw new Error("META_LEAD_ACCESS_TOKEN não configurado.");
  const fields = "id,created_time,ad_id,adset_id,campaign_id,form_id,field_data";
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(externalLeadId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}` } });
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
    await admin.from("integration_outbox").update({ status: "processing", attempts, locked_at: new Date().toISOString(), locked_by: workerId }).eq("id", event.id);

    try {
      const now = new Date().toISOString();
      if (event.topic === "message.send" && event.aggregate_id) {
        const { data: message, error: messageError } = await admin.from("messages").select("id,channel,recipient,content").eq("id", event.aggregate_id).single();
        if (messageError || !message) throw messageError ?? new Error("Mensagem não encontrada.");
        if (message.channel !== "whatsapp") throw new Error(`Canal ainda não conectado ao worker: ${message.channel}`);
        const externalMessageId = await deliverWhatsApp(message.recipient, message.content);
        await admin.from("messages").update({ status: "sent", sent_at: now, external_message_id: externalMessageId, error: null }).eq("id", message.id);
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
          const { data: existingLead } = await admin.from("leads").select("id").eq("organization_id", metaEvent.organization_id).contains("metadata", { meta: { externalLeadId: metaEvent.external_lead_id } }).maybeSingle();
          const leadInsert = existingLead ? { data: existingLead, error: null } : await admin.from("leads").insert({
            organization_id: metaEvent.organization_id,
            name,
            email,
            phone,
            source: "Meta Lead Ads",
            status: "novo",
            temperature: "frio",
            score: 0,
            assigned_to: sourceResult.data?.default_owner_id || null,
            metadata: { meta: { externalLeadId: metaEvent.external_lead_id, pageId: metaEvent.page_id, formId: leadData.form_id || metaEvent.form_id, adId: leadData.ad_id || metaEvent.ad_id, adsetId: leadData.adset_id || metaEvent.adset_id, campaignId: leadData.campaign_id || metaEvent.campaign_external_id, sourceName: sourceResult.data?.name || null, dataSharingConsent: sourceResult.data?.conversion_sharing_enabled === true, consentBasis: sourceResult.data?.consent_basis || null } },
            created_at: leadData.created_time || now,
            next_action_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          }).select("id").single();
          const { data: lead, error: leadError } = leadInsert;
          if (leadError || !lead) throw leadError ?? new Error("Falha ao criar lead Meta.");
          await Promise.all([
            admin.from("meta_lead_events").update({ status: "imported", lead_id: lead.id, processed_at: now, last_error: null }).eq("id", metaEvent.id),
            admin.from("campaign_events").insert({ organization_id: metaEvent.organization_id, lead_id: lead.id, event_type: "lead_created", source: "meta", external_event_id: metaEvent.external_lead_id, payload: { pageId: metaEvent.page_id, formId: leadData.form_id || metaEvent.form_id, adId: leadData.ad_id || metaEvent.ad_id, adsetId: leadData.adset_id || metaEvent.adset_id, campaignId: leadData.campaign_id || metaEvent.campaign_external_id }, occurred_at: leadData.created_time || now }),
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
        const { data: lead, error: leadError } = await admin.from("leads").select("email,phone,metadata").eq("id", conversion.lead_id).eq("organization_id", conversion.organization_id).single();
        if (leadError || !lead) throw leadError ?? new Error("Lead da conversão não encontrado.");
        const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
        const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
        if (config.consent_required && meta.dataSharingConsent !== true) throw new Error("Compartilhamento bloqueado: consentimento não registrado.");
        const userData: { em?: string[]; ph?: string[] } = {};
        if (lead.email) userData.em = [hashMetaValue(lead.email)];
        if (lead.phone) {
          const phone = normalizeMetaPhone(lead.phone);
          if (phone) userData.ph = [hashMetaValue(phone)];
        }
        if (!userData.em && !userData.ph) throw new Error("Conversão sem identificador elegível para correspondência.");
        await admin.from("meta_conversion_events").update({ status: "processing", attempts: Number(conversion.attempts || 0) + 1, last_error: null }).eq("id", conversion.id);
        const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
        const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(config.dataset_id)}/events`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ data: [{ event_name: conversion.event_name, event_time: Math.floor(new Date(conversion.occurred_at).getTime() / 1000), event_id: conversion.event_id, action_source: conversion.action_source, user_data: userData, custom_data: conversion.custom_data }], test_event_code: config.test_event_code }),
        });
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
