import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/security/webhook-signature";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceDistributedRateLimit } from "@/lib/security/abuse-protection";
import { ensureMetaLeadFetchTask, ensureOutboxTask } from "@/lib/integrations/outbox-task";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  logger.warn("meta.webhook.verification_failed", { mode, hasToken: Boolean(token) });
  return NextResponse.json({ error: "verification_failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const distributed = await enforceDistributedRateLimit(request, { scope: "meta-webhook", limit: 120, windowSeconds: 60 });
  if (!distributed.allowed) return distributed.response;
  const rate = checkRateLimit(clientKey(request, "meta-webhook"), { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const secret = process.env.META_APP_SECRET ?? "";

  if (!verifyWebhookSignature(body, signature, secret)) {
    logger.warn("meta.webhook.invalid_signature", { contentLength: body.length });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  type LeadgenValue = { leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string; adgroup_id?: string; campaign_id?: string; created_time?: number };
  type MetaPayload = { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: LeadgenValue }> }> };
  const event = payload as MetaPayload;
  const admin = getSupabaseAdmin();
  let accepted = 0;
  let duplicates = 0;
  let unmapped = 0;
  let recovered = 0;
  let unrecoverable = 0;

  /**
   * Guarda a lead que chegou sem destino, para reprocessar depois.
   *
   * Antes isto era só `logger.warn` — e o próprio comentário admitia
   * "best-effort ... para replay manual". Log rotaciona; a lead sumia. Deixou
   * de ser hipótese em 2026-07-28: as campanhas ativas usam uma página que o
   * System User não administra, então TODA lead delas cai aqui.
   *
   * Falhar ao guardar não derruba o webhook: responder erro à Meta faria ela
   * reentregar, e a reentrega cairia no mesmo lugar. Melhor registrar o que
   * deu errado e seguir — o `unmapped` já aparece na resposta.
   */
  const guardarSemDestino = async (motivo: string, value: LeadgenValue, pageId: string | null) => {
    const { error } = await admin.from("meta_leads_sem_destino").upsert({
      leadgen_id: String(value.leadgen_id),
      page_id: pageId,
      form_id: value.form_id ?? null,
      ad_id: value.ad_id ?? null,
      campaign_external_id: value.campaign_id ?? null,
      motivo,
      payload: value,
    }, { onConflict: "leadgen_id", ignoreDuplicates: true });
    if (error) logger.error("meta.webhook.sem_destino_nao_guardada", error, { motivo, leadgenId: value.leadgen_id });
  };

  for (const entry of event.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;
      const value = change.value;
      const pageId = value.page_id || entry.id;
      if (!pageId) {
        unmapped += 1;
        await guardarSemDestino("missing_page_id", value, null);
        logger.warn("meta.webhook.unmapped_payload", { reason: "missing_page_id", leadgenId: value.leadgen_id });
        continue;
      }
      let sourceQuery = admin.from("meta_lead_sources").select("id,organization_id").eq("page_id", pageId).eq("active", true);
      sourceQuery = value.form_id ? sourceQuery.or(`form_id.eq.${value.form_id},form_id.is.null`) : sourceQuery.is("form_id", null);
      const { data: sources, error: sourceError } = await sourceQuery.order("form_id", { ascending: false, nullsFirst: false }).limit(1);
      if (sourceError) {
        // Erro de consulta (transitório de banco) NÃO é "fonte não mapeada":
        // responde 503 para a Meta reenviar o evento em vez de perder o lead.
        logger.error("meta.webhook.source_lookup_failed", sourceError, { pageId, formId: value.form_id, leadgenId: value.leadgen_id });
        return NextResponse.json({ error: "source_lookup_failed" }, { status: 503, headers: { "Retry-After": "60" } });
      }
      let source = sources?.[0];
      if (!source) {
        // ── NENHUMA LEAD PAGA É DESCARTADA ──────────────────────────────────
        //
        // Antes, fonte não mapeada ou INATIVA virava uma linha de log e a lead
        // sumia. Medido nesta base: o único formulário ativo tinha ZERO leads,
        // enquanto três inativos somavam 21 — a Meta versiona formulário a cada
        // edição ("Arvo v4" → "Arvo v5"), o CRM ficou preso na versão antiga, e
        // tudo que chegasse pela nova era jogado fora.
        //
        // Descartar lead que já custou verba para chegar é o pior desfecho
        // possível. Agora a fonte desconhecida é REGISTRADA como inativa e o
        // evento é gravado contra ela: a lead fica retida, aparece em
        // Marketing → Leads represadas, e a liderança decide se aquele
        // formulário entra na operação.
        //
        // Registrar NÃO é ativar. A fonte nasce `active: false` de propósito —
        // ativar sozinho faria o Atlas aceitar qualquer formulário que alguém
        // criasse na Meta, sem ninguém decidir.
        const organizacaoDaPagina = await admin
          .from("meta_lead_sources")
          .select("organization_id")
          .eq("page_id", pageId)
          .limit(1)
          .maybeSingle();

        if (!organizacaoDaPagina.data?.organization_id) {
          // Página que o Atlas não conhece de forma nenhuma: aí não há sequer a
          // qual organização atribuir, e inventar uma seria pior que perder.
          unmapped += 1;
          await guardarSemDestino("unknown_page", value, pageId);
          logger.warn("meta.webhook.unmapped_payload", { reason: "unknown_page", pageId, formId: value.form_id, leadgenId: value.leadgen_id });
          continue;
        }

        const { data: fonteNova, error: erroDeRegistro } = await admin
          .from("meta_lead_sources")
          .insert({
            organization_id: organizacaoDaPagina.data.organization_id,
            page_id: pageId,
            form_id: value.form_id ?? null,
            name: `[auto] Formulário ${value.form_id ?? "sem id"} — descoberto pelo webhook`,
            active: false,
          })
          .select("id,organization_id")
          .single();

        if (erroDeRegistro || !fonteNova) {
          // Corrida: outro evento do mesmo lote pode ter acabado de registrar a
          // mesma fonte. Tenta reler antes de desistir.
          const relida = await admin
            .from("meta_lead_sources")
            .select("id,organization_id")
            .eq("page_id", pageId)
            .eq("form_id", value.form_id ?? "")
            .limit(1)
            .maybeSingle();
          if (!relida.data) {
            unmapped += 1;
            logger.error("meta.webhook.source_autoregister_failed", erroDeRegistro, { pageId, formId: value.form_id, leadgenId: value.leadgen_id, payload: value });
            continue;
          }
          source = relida.data;
        } else {
          source = fonteNova;
          logger.warn("meta.webhook.source_autoregistered", {
            pageId, formId: value.form_id, sourceId: fonteNova.id,
            aviso: "Formulário novo retido para decisão humana em Marketing → Leads represadas.",
          });
        }
        unmapped += 1;
      }

      const { data: inserted, error: insertError } = await admin.from("meta_lead_events").insert({
        organization_id: source.organization_id,
        source_id: source.id,
        external_lead_id: value.leadgen_id,
        page_id: pageId,
        form_id: value.form_id || null,
        ad_id: value.ad_id || null,
        adset_id: value.adgroup_id || null,
        campaign_external_id: value.campaign_id || null,
        payload: value,
        received_at: value.created_time ? new Date(value.created_time * 1000).toISOString() : new Date().toISOString(),
      }).select("id").single();
      if (insertError) {
        if (insertError.code !== "23505") {
          logger.error("meta.webhook.persistence_failed", insertError, { leadgenId: value.leadgen_id });
          return NextResponse.json({ error: "persistence_failed" }, { status: 500 });
        }
        // O evento já tinha sido recebido — mas isso NÃO prova que a tarefa do
        // outbox existe. O caminho anterior (`continue` cego) supunha que sim, e
        // era exatamente a sequência do desastre: insert do evento OK, insert do
        // outbox falho, 500 devolvido contando com o reenvio da Meta, reenvio
        // batendo no unique e pulando fora — evento 'received' para sempre, sem
        // tarefa, sem erro, sem dead letter. Lead pago perdido em silêncio.
        duplicates += 1;
        // String() só reafirma o guard da entrada do laço (leadgen_id é
        // opcional no tipo do payload da Meta, nunca nulo aqui).
        const healed = await ensureMetaLeadFetchTask(admin, { organizationId: source.organization_id, externalLeadId: String(value.leadgen_id) });
        if (!healed.ok) {
          logger.error("meta.webhook.outbox_recovery_failed", new Error(healed.reason), { leadgenId: value.leadgen_id, code: healed.code });
          return NextResponse.json({ error: "outbox_failed" }, { status: 500 });
        }
        if (healed.state === "created") {
          recovered += 1;
          logger.warn("meta.webhook.outbox_task_recovered", { leadgenId: value.leadgen_id, organizationId: source.organization_id });
        }
        if (healed.state === "aggregate_not_visible") {
          // external_lead_id é unique GLOBAL: a colisão veio de um evento que não
          // pertence a esta organização. Não é recuperável aqui e não pode ser
          // contado como se estivesse resolvido.
          unrecoverable += 1;
          logger.warn("meta.webhook.duplicate_outside_organization", { leadgenId: value.leadgen_id, organizationId: source.organization_id });
        }
        continue;
      }
      const queued = await ensureOutboxTask(admin, { organizationId: source.organization_id, topic: "meta.lead.fetch", aggregateType: "meta_lead_event", aggregateId: inserted.id, payload: { externalLeadId: value.leadgen_id } });
      if (!queued.ok) {
        // Sem outbox o lead nunca seria processado: 500 força o reenvio pela Meta
        // — e agora o reenvio REFAZ a tarefa em vez de pular fora.
        logger.error("meta.webhook.outbox_failed", new Error(queued.reason), { eventId: inserted.id, leadgenId: value.leadgen_id, code: queued.code });
        return NextResponse.json({ error: "outbox_failed" }, { status: 500 });
      }
      accepted += 1;
    }
  }

  logger.info("meta.webhook.processed", { object: event.object, accepted, duplicates, unmapped, recovered, unrecoverable });
  return NextResponse.json({ received: true, accepted, duplicates, unmapped, recovered, unrecoverable }, { status: 200 });
}
