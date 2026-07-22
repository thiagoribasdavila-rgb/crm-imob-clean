import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { hashMetaValue, queueMetaConversion } from "@/lib/meta/conversions";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { integrationCatalog } from "@/lib/integrations/catalog";
import { analyzeInboundWhatsApp } from "@/lib/ai/whatsapp-conversation-intelligence";
import { resolveLeadOwner, recordDistribution } from "@/lib/distribution/hierarchical-cascade";
import { metaGraphVersion, describeMetaGraphFailure } from "@/lib/meta/graph";
import { classifyOutboxFailure } from "@/lib/meta/outbox-failure";
import { AUTO_REGISTERED_CAMPAIGN_STATUS, autoRegisteredCampaignName } from "@/lib/marketing/campaign-provenance";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(secret && token && token === secret);
}

type WhatsAppTemplate = { name: string; language: string };

async function deliverWhatsApp(recipient: string, content: string, template?: WhatsAppTemplate) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = metaGraphVersion();
  if (!phoneNumberId || !accessToken) throw new Error("Credenciais do WhatsApp não configuradas.");

  const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(template
      ? { messaging_product: "whatsapp", to: recipient, type: "template", template: { name: template.name, language: { code: template.language } } }
      : { messaging_product: "whatsapp", to: recipient, type: "text", text: { body: content } }),
  }, { timeoutMs: 30_000, retries: 0, operation: "WhatsApp" });

  const data = (await response.json()) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number; error_subcode?: number } };
  // describeMetaGraphFailure embute [code X/Y] na mensagem — é o que permite
  // classificar token expirado (190/463/467) sem enterrar a fila lá no catch.
  if (!response.ok) throw new Error(describeMetaGraphFailure(response.status, data));
  return data.messages?.[0]?.id ?? null;
}

async function fetchMetaLead(externalLeadId: string) {
  const accessToken = process.env.META_LEAD_ACCESS_TOKEN;
  const apiVersion = metaGraphVersion();
  if (!accessToken) throw new Error("META_LEAD_ACCESS_TOKEN não configurado.");
  const fields = "id,created_time,ad_id,adset_id,campaign_id,form_id,field_data";
  const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(externalLeadId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}` } }, { timeoutMs: 30_000, retries: 2, operation: "Meta Lead Ads" });
  const data = await response.json() as { id?: string; created_time?: string; ad_id?: string; adset_id?: string; campaign_id?: string; form_id?: string; field_data?: Array<{ name: string; values?: string[] }>; error?: { message?: string } };
  if (!response.ok) throw new Error(describeMetaGraphFailure(response.status, data));
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

// Linhagem publicada em metadata.meta.campaignLinkage: a única forma de saber
// DEPOIS por que um lead ficou (ou não) preso a uma campanha. marketing_campaigns
// não tem coluna de procedência, então a procedência mora no lead.
type CampaignLinkage =
  | "campanha_encontrada"
  | "campanha_registrada_pela_ingestao"
  | "sem_id_de_campanha_no_evento"
  | "registro_de_campanha_indisponivel";

// Código do Postgres para foreign_key_violation. Ver o fallback no insert do
// lead: enquanto 20260722175000 não estiver aplicada, o gatilho de atribuição
// repassa leads.campaign_id para uma FK que ainda aponta para public.campaigns.
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Resolve o id externo da campanha Meta em leads.campaign_id.
 *
 * Sem isto o identificador vivia só dentro de metadata.meta e TODO agregado por
 * campanha (campaign-quality, cost-report, conselheiro Andromeda) somava zero:
 * o bucket é indexado por leads.campaign_id e a coluna nunca era escrita.
 *
 * A linha em marketing_campaigns é criada quando não existe porque campanha é
 * REGISTRO do que a Meta já fez, não ação de efeito externo — nenhum caminho de
 * execução lê marketing_campaigns (app/api/v1/marketing/execute age sobre ids
 * informados na requisição + approval_requests aprovado). Sem essa criação o elo
 * seguiria rompido na prática: a tabela está vazia no banco vivo, então todo
 * lead cairia em campaign_id nulo de novo.
 *
 * NADA NASCE ATIVO: o CHECK da tabela só admite
 * ACTIVE/PAUSED/COMPLETED/ARCHIVED e o Atlas nunca consultou o estado desta
 * campanha na Meta (o webhook de leadgen não traz status e a Graph API não é
 * chamada aqui). Gravar 'ACTIVE' seria asserir um estado que ninguém verificou
 * — a lista de campanhas imprime "META · ACTIVE" como se fosse fato. Então a
 * ingestão grava PAUSED (o valor que NÃO afirma "está no ar") e marca a
 * procedência no início do nome, com o prefixo estável de
 * lib/marketing/campaign-provenance: a tela troca o status por "estado não
 * verificado". started_at fica nulo em vez de inferido, e o nome carrega o id
 * externo porque o evento da Meta não traz nome de campanha.
 *
 * Falha de registro NUNCA derruba a ingestão: o lead entra com campaign_id nulo
 * e a linhagem explica o motivo. Perder o lead seria pior que perder o elo.
 */
async function resolveMetaCampaign(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  externalCampaignId: string | null,
): Promise<{ campaignId: string | null; linkage: CampaignLinkage }> {
  if (!externalCampaignId) return { campaignId: null, linkage: "sem_id_de_campanha_no_evento" };

  // A chave é (organization_id, platform, external_campaign_id) — a mesma do
  // unique da produção e da migration 20260722174000. Filtrar platform não é
  // detalhe: sem isso uma campanha cadastrada à mão como 'GOOGLE' com o mesmo id
  // externo seria sequestrada para um lead da Meta, e o insert deste caminho
  // colidiria com um índice que o lookup não enxerga.
  // .order(created_at) garante escolha determinística mesmo em banco que ainda
  // não recebeu o índice único (duas linhas herdadas de uma corrida antiga
  // fariam .limit(1) escolher linha arbitrária a cada leitura).
  const lookup = () => admin
    .from("marketing_campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("platform", "META")
    .eq("external_campaign_id", externalCampaignId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const existing = await lookup();
  if (existing.error) {
    logger.warn("outbox.campaign_lookup_failed", { organizationId, externalCampaignId, code: existing.error.code });
    return { campaignId: null, linkage: "registro_de_campanha_indisponivel" };
  }
  if (existing.data?.id) return { campaignId: existing.data.id, linkage: "campanha_encontrada" };

  const created = await admin.from("marketing_campaigns").insert({
    organization_id: organizationId,
    // O nome é o único canal de procedência que a tabela oferece (não há coluna
    // de metadados, e criar uma tornaria a ingestão refém da ordem de deploy):
    // quem abrir a lista vê que a linha veio da ingestão e que o nome real ainda
    // não é conhecido, em vez de um rótulo inventado.
    name: autoRegisteredCampaignName(externalCampaignId, "ingestao"),
    platform: "META",
    external_campaign_id: externalCampaignId,
    status: AUTO_REGISTERED_CAMPAIGN_STATUS,
  }).select("id").single();
  if (created.data?.id) {
    logger.info("outbox.campaign_autoregistered", { organizationId, externalCampaignId, campaignId: created.data.id });
    return { campaignId: created.data.id, linkage: "campanha_registrada_pela_ingestao" };
  }

  // Corrida entre workers: com o unique de 20260722174000 aplicado (produção já
  // tinha o equivalente), quem perde relê em vez de duplicar a campanha.
  const retry = await lookup();
  if (retry.data?.id) return { campaignId: retry.data.id, linkage: "campanha_encontrada" };
  logger.warn("outbox.campaign_register_failed", { organizationId, externalCampaignId, code: created.error?.code });
  return { campaignId: null, linkage: "registro_de_campanha_indisponivel" };
}

/**
 * Campanha registrada NESTA iteração para um lead que não entrou = linha órfã.
 * Ela apareceria no filtro de campanhas da tela de leads e nos relatórios com
 * zero lead — registro de um lead que nunca existiu. Só apaga quando a linha
 * nasceu aqui E não ficou com nenhum lead preso a ela; qualquer outra coisa é
 * dado de outra pessoa e fica onde está.
 */
async function discardOrphanCampaign(
  admin: ReturnType<typeof getSupabaseAdmin>,
  link: { campaignId: string | null; linkage: CampaignLinkage } | null,
  organizationId: string,
) {
  if (!link?.campaignId || link.linkage !== "campanha_registrada_pela_ingestao") return;
  const { count, error } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("campaign_id", link.campaignId);
  if (error || (count ?? 0) > 0) return;
  await admin.from("marketing_campaigns").delete().eq("id", link.campaignId).eq("organization_id", organizationId);
  logger.warn("outbox.campaign_autoregistered_discarded", { organizationId, campaignId: link.campaignId });
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
    const originalAttempts = Number(event.attempts || 0);
    const attempts = originalAttempts + 1;
    const { data: claimed } = await admin.from("integration_outbox").update({ status: "processing", attempts, locked_at: new Date().toISOString(), locked_by: workerId }).eq("id", event.id).in("status", ["pending", "failed"]).select("id").maybeSingle();
    if (!claimed) continue;

    try {
      const now = new Date().toISOString();
      if (event.topic === "message.send" && event.aggregate_id) {
        const { data: message, error: messageError } = await admin.from("messages").select("id,channel,recipient,content,media").eq("id", event.aggregate_id).single();
        if (messageError || !message) throw messageError ?? new Error("Mensagem não encontrada.");
        if (message.channel !== "whatsapp") throw new Error(`Canal ainda não conectado ao worker: ${message.channel}`);
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
        const externalMessageId = await deliverWhatsApp(message.recipient, message.content, template);
        await admin.from("messages").update({ status: "sent", sent_at: now, external_message_id: externalMessageId, error: null }).eq("id", message.id);
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
          const { data: existingLead } = await admin.from("leads").select("id").eq("organization_id", metaEvent.organization_id).contains("metadata", { meta: { externalLeadId: metaEvent.external_lead_id } }).maybeSingle();
          // O evento do webhook (metaEvent) e a leitura da Graph (leadData) podem
          // divergir; a Graph é a fonte mais fresca, o webhook é o fallback.
          const campaignExternalId = String(leadData.campaign_id || metaEvent.campaign_external_id || "").trim() || null;
          // Distribuição RBAC 10/10: dono padrão validado → cascata corretor→gerente→fila
          // (determinística, capacity-aware, offline-safe). Auditoria em lead_distribution_history.
          const [ownership, campaignLink] = existingLead
            ? ([null, null] as const)
            : await Promise.all([
              resolveLeadOwner(admin, metaEvent.organization_id, sourceResult.data?.default_owner_id || null),
              resolveMetaCampaign(admin, metaEvent.organization_id, campaignExternalId),
            ]);
          const leadMeta = { externalLeadId: metaEvent.external_lead_id, pageId: metaEvent.page_id, formId: leadData.form_id || metaEvent.form_id, adId: leadData.ad_id || metaEvent.ad_id, adsetId: leadData.adset_id || metaEvent.adset_id, campaignId: leadData.campaign_id || metaEvent.campaign_external_id, campaignLinkage: campaignLink?.linkage ?? null, sourceName: sourceResult.data?.name || null, dataSharingConsent: sourceResult.data?.conversion_sharing_enabled === true, consentBasis: sourceResult.data?.consent_basis || null };
          const leadPayload = {
            organization_id: metaEvent.organization_id,
            name,
            email,
            phone,
            source: "Meta Lead Ads",
            status: "novo",
            temperature: "frio",
            score: 0,
            assigned_to: ownership?.ownerId ?? null,
            // campaign_id é o elo que liga o lead ao dinheiro gasto; metadata.meta
            // continua idêntico (nada removido) e ganha só a linhagem da resolução.
            campaign_id: campaignLink?.campaignId ?? null,
            metadata: { meta: leadMeta, distribution: ownership ? { tier: ownership.tier, reason: ownership.reason } : undefined },
            created_at: leadData.created_time || now,
            next_action_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          };
          const insertLead = (payload: typeof leadPayload) => admin.from("leads").insert(payload).select("id").single();
          let leadInsert = existingLead ? { data: existingLead, error: null } : await insertLead(leadPayload);
          // REDE DE SEGURANÇA DO ELO — a promessa desta rota ("falha de registro
          // nunca derruba a ingestão") tem de valer também com o banco atrasado.
          // private.capture_lead_attribution é AFTER INSERT em public.leads e
          // repassa new.campaign_id para lead_attribution_touches.campaign_id,
          // cuja FK ainda aponta para public.campaigns onde 20260722175000 não
          // foi aplicada (medido na homologação em 2026-07-22: a FK antiga está
          // lá, public.campaigns tem 0 linhas e o gatilho está ATIVO). Nesse
          // banco, o primeiro lead com campanha resolvida derrubaria o próprio
          // INSERT do lead na mesma transação e, na 5ª tentativa, o evento iria
          // para dead_letter: lead pago PERDIDO. Perder o elo é ruim; perder o
          // lead é pior. O elo volta sozinho assim que o DDL entrar.
          //
          // A condição é o CÓDIGO do erro + existir campaign_id, não o texto da
          // mensagem: casar por texto é mais preciso, mas se a mensagem não
          // trouxer o nome da tabela a rede de segurança falha calada e o lead
          // se perde — exatamente o desastre que ela evita. Um 23503 de outra
          // origem (assigned_to, por exemplo) só custa uma segunda tentativa
          // que falha igual e segue para o catch. A mensagem vai no log.
          if (leadInsert.error?.code === FOREIGN_KEY_VIOLATION && leadPayload.campaign_id) {
            logger.warn("outbox.campaign_link_rejected_by_fk", { organizationId: metaEvent.organization_id, campaignId: leadPayload.campaign_id, code: leadInsert.error.code, detail: String(leadInsert.error.message || "").slice(0, 200) });
            leadInsert = await insertLead({
              ...leadPayload,
              campaign_id: null,
              metadata: { ...leadPayload.metadata, meta: { ...leadMeta, campaignLinkage: "registro_de_campanha_indisponivel" } },
            });
          }
          const { data: lead, error: leadError } = leadInsert;
          if (leadError || !lead) {
            await discardOrphanCampaign(admin, campaignLink, metaEvent.organization_id);
            throw leadError ?? new Error("Falha ao criar lead Meta.");
          }
          if (ownership?.ownerId) await recordDistribution(admin, { organizationId: metaEvent.organization_id, leadId: lead.id, ownerId: ownership.ownerId, reason: ownership.reason });
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
        const apiVersion = metaGraphVersion();
        const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(config.dataset_id)}/events`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ data: [{ event_name: conversion.event_name, event_time: Math.floor(new Date(conversion.occurred_at).getTime() / 1000), event_id: conversion.event_id, action_source: conversion.action_source, user_data: userData, custom_data: { ...conversion.custom_data, atlas_signal_version: "andromeda-v1" } }], test_event_code: config.test_event_code }),
        }, { timeoutMs: 30_000, retries: 1, retryUnsafe: true, operation: "Meta Conversions API" });
        const metaResponse = await response.json() as Record<string, unknown>;
        // Mesma razão do WhatsApp: preserva code/subcode na mensagem para o
        // catch distinguir token expirado de erro de dado da conversão.
        if (!response.ok) throw new Error(describeMetaGraphFailure(response.status, metaResponse));
        await admin.from("meta_conversion_events").update({ status: "delivered", delivered_at: now, meta_response: metaResponse, last_error: null }).eq("id", conversion.id);
      } else if (event.topic === "whatsapp.inbound.analyze" && event.aggregate_id) {
        const { data: message } = await admin.from("messages").select("id,organization_id,conversation_id,content,direction").eq("id", event.aggregate_id).maybeSingle();
        if (message && message.direction === "inbound") {
          const payload = event.payload && typeof event.payload === "object" ? event.payload as { conversationId?: string; leadId?: string } : {};
          const leadId = payload.leadId || null;
          const { data: recent } = await admin.from("messages").select("direction,content,created_at").eq("conversation_id", message.conversation_id).order("created_at", { ascending: true }).limit(20);
          const conversationText = (recent ?? []).map((m) => `${m.direction === "inbound" ? "Cliente" : "Corretor"}: ${String(m.content || "").slice(0, 300)}`).join("\n");
          const insight = await analyzeInboundWhatsApp({ organizationId: message.organization_id, conversationText, latestText: String(message.content || "") });
          const { data: insightRow } = await admin.from("whatsapp_message_insights").upsert({
            organization_id: message.organization_id,
            conversation_id: message.conversation_id,
            message_id: message.id,
            lead_id: leadId,
            intent: insight.intent,
            objection_keys: insight.objectionKeys,
            summary: insight.summary,
            recommended_action_key: insight.recommendedAction,
            temperature_signal: insight.temperature,
            source: insight.source,
            model: insight.model,
          }, { onConflict: "message_id", ignoreDuplicates: true }).select("id").maybeSingle();
          if (insightRow && leadId) {
            await admin.from("activities").insert({ organization_id: message.organization_id, lead_id: leadId, type: "whatsapp_insight", title: `IA leu a conversa: ${insight.intent} (${insight.temperature})`, description: `${insight.summary} · Próxima ação sugerida: ${insight.recommendedAction}${insight.objectionKeys.length ? ` · Objeções: ${insight.objectionKeys.join(", ")}` : ""}`, metadata: { source: insight.source, model: insight.model, intent: insight.intent, objections: insight.objectionKeys, recommendedAction: insight.recommendedAction }, occurred_at: now });
          }
        }
      } else if (event.topic === "portal.lead.ingest" && event.aggregate_id) {
        const { data: portalEvent, error: portalError } = await admin.from("portal_lead_events").select("id,organization_id,source_id,provider,external_lead_id,listing_id,contact,status").eq("id", event.aggregate_id).single();
        if (portalError || !portalEvent) throw portalError ?? new Error("Evento de portal não encontrado.");
        if (portalEvent.status !== "imported") {
          await admin.from("portal_lead_events").update({ status: "processing", last_error: null }).eq("id", portalEvent.id);
          const { data: sourceRow } = await admin.from("portal_lead_sources").select("default_owner_id,name").eq("id", portalEvent.source_id).single();
          const contact = portalEvent.contact && typeof portalEvent.contact === "object" ? portalEvent.contact as { name?: string; email?: string; phone?: string; message?: string } : {};
          const providerLabel = integrationCatalog.find((item) => item.provider === portalEvent.provider)?.name || portalEvent.provider;
          const { data: existingLead } = await admin.from("leads").select("id").eq("organization_id", portalEvent.organization_id).contains("metadata", { portal: { provider: portalEvent.provider, externalLeadId: portalEvent.external_lead_id } }).maybeSingle();
          // Mesma cascata RBAC do caminho Meta — portais tinham o mesmo gap.
          const ownership = existingLead
            ? null
            : await resolveLeadOwner(admin, portalEvent.organization_id, sourceRow?.default_owner_id || null);
          const leadInsert = existingLead ? { data: existingLead, error: null } : await admin.from("leads").insert({
            organization_id: portalEvent.organization_id,
            name: contact.name || `Lead ${providerLabel}`,
            email: contact.email || null,
            phone: contact.phone || null,
            source: providerLabel,
            status: "novo",
            temperature: "frio",
            score: 0,
            assigned_to: ownership?.ownerId ?? null,
            metadata: { portal: { provider: portalEvent.provider, externalLeadId: portalEvent.external_lead_id, listingId: portalEvent.listing_id, sourceName: sourceRow?.name || null, message: contact.message || null }, distribution: ownership ? { tier: ownership.tier, reason: ownership.reason } : undefined },
            created_at: now,
            next_action_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          }).select("id").single();
          const { data: lead, error: leadError } = leadInsert;
          if (leadError || !lead) throw leadError ?? new Error("Falha ao criar lead de portal.");
          if (ownership?.ownerId) await recordDistribution(admin, { organizationId: portalEvent.organization_id, leadId: lead.id, ownerId: ownership.ownerId, reason: ownership.reason });
          await Promise.all([
            admin.from("portal_lead_events").update({ status: "imported", lead_id: lead.id, processed_at: now, last_error: null }).eq("id", portalEvent.id),
            admin.from("campaign_events").insert({ organization_id: portalEvent.organization_id, lead_id: lead.id, event_type: "lead_created", source: "portal", external_event_id: portalEvent.external_lead_id, payload: { provider: portalEvent.provider, listingId: portalEvent.listing_id }, occurred_at: now }),
          ]);
        }
      } else {
        throw new Error(`Tópico não suportado: ${event.topic}`);
      }

      await admin.from("integration_outbox").update({ status: "delivered", delivered_at: now, last_error: null, cause: null }).eq("id", event.id);
      delivered += 1;
    } catch (processingError) {
      const message = processingError instanceof Error ? processingError.message : "Falha desconhecida";
      const cause = classifyOutboxFailure({ message });

      // Erro de CREDENCIAL (token 190/463/467): não é culpa do evento. NÃO
      // consome tentativa (reverte o incremento do claim), mantém o evento
      // retryable com backoff longo e marca causa='token_unhealthy'. Assim,
      // renovar o token faz a fila voltar a fluir sozinha — nada vai a
      // dead_letter só porque o token expirou. Erro de dado continua abaixo.
      if (cause === "token_unhealthy") {
        const retryAt = new Date(Date.now() + 30 * 60_000).toISOString();
        await admin.from("integration_outbox").update({ status: "failed", attempts: originalAttempts, available_at: retryAt, last_error: message, cause: "token_unhealthy" }).eq("id", event.id);
        // Agregados aterrissam em estado retryable (nunca dead_letter/consumo):
        // ao reprocessar com token são, os guards (status !== 'imported') deixam
        // o fluxo seguir de novo.
        if (event.topic === "meta.lead.fetch" && event.aggregate_id) await admin.from("meta_lead_events").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
        if (event.topic === "meta.conversion.send" && event.aggregate_id) await admin.from("meta_conversion_events").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
        if (event.topic === "portal.lead.ingest" && event.aggregate_id) await admin.from("portal_lead_events").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
        // Sinal estruturado para readiness/observabilidade: token precisa renovar.
        logger.warn("outbox.token_unhealthy", { eventId: event.id, topic: event.topic, organizationId: event.organization_id });
        failed += 1;
        continue;
      }

      const terminal = attempts >= 5;
      const nextAttempt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();

      await admin.from("integration_outbox").update({ status: terminal ? "dead_letter" : "failed", available_at: nextAttempt, last_error: message, cause: null }).eq("id", event.id);
      if (event.topic === "meta.lead.fetch" && event.aggregate_id) await admin.from("meta_lead_events").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
      if (event.topic === "meta.conversion.send" && event.aggregate_id) await admin.from("meta_conversion_events").update({ status: terminal ? "dead_letter" : "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
      if (event.topic === "portal.lead.ingest" && event.aggregate_id) await admin.from("portal_lead_events").update({ status: terminal ? "dead_letter" : "failed", last_error: message.slice(0, 1000) }).eq("id", event.aggregate_id);
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
