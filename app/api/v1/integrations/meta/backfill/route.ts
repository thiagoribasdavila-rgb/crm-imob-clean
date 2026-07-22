// app/api/v1/integrations/meta/backfill/route.ts
// -----------------------------------------------------------------------------
// Backfill dos leads que JÁ entraram nos formulários Meta (ex.: os de hoje),
// antes do webhook estar assinado. Reaproveita a MESMA esteira do webhook:
// grava em meta_lead_events (dedup) e enfileira meta.lead.fetch no outbox, de
// forma que o worker (/api/v2/outbox/process) puxe os dados e crie o lead no CRM
// exatamente como no tempo real. Idempotente: reexecutar não duplica.
//
// POST /api/v1/integrations/meta/backfill
//   body: { sinceUnix?: number, pageId?: string }   // default: início de hoje (America/Sao_Paulo)
// -----------------------------------------------------------------------------
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { ensureMetaLeadFetchTask, ensureOutboxTask } from "@/lib/integrations/outbox-task";

export const dynamic = "force-dynamic";

function canManage(role: string | null, legacyRole: string) {
  return ["director", "superintendent", "manager"].includes(role || "") || ["admin", "manager"].includes(legacyRole);
}

/** Início do dia atual no fuso America/Sao_Paulo (UTC-3), em unix seconds. */
function startOfTodaySaoPaulo(): number {
  const now = new Date();
  const spNow = new Date(now.getTime() - 3 * 3_600_000); // desloca para UTC-3
  const midnightUtcMinus3 = Date.UTC(spNow.getUTCFullYear(), spNow.getUTCMonth(), spNow.getUTCDate(), 3, 0, 0);
  return Math.floor(midnightUtcMinus3 / 1000);
}

type GraphLead = { id: string; created_time?: string; ad_id?: string; adset_id?: string; campaign_id?: string; form_id?: string };
type GraphPage = { data?: GraphLead[]; paging?: { cursors?: { after?: string } } };

export async function POST(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManage(access.access.profile.commercialRole, access.access.profile.role)) {
    return NextResponse.json({ error: "Permissão insuficiente para executar o backfill Meta." }, { status: 403 });
  }

  const accessToken = process.env.META_LEAD_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  if (!accessToken) return NextResponse.json({ error: "META_LEAD_ACCESS_TOKEN ausente." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { sinceUnix?: number; pageId?: string };
  const sinceUnix = Number.isFinite(body.sinceUnix) ? Number(body.sinceUnix) : startOfTodaySaoPaulo();
  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();

  // Só formulários registrados e ativos desta organização (com form_id — o backfill puxa por formulário).
  let sourcesQuery = admin
    .from("meta_lead_sources")
    .select("id,page_id,form_id")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .not("form_id", "is", null);
  if (body.pageId) sourcesQuery = sourcesQuery.eq("page_id", String(body.pageId));
  const { data: sources, error: sourcesError } = await sourcesQuery;
  if (sourcesError) return NextResponse.json({ error: "Aplique a migração Meta Lead Ads." }, { status: 503 });
  if (!sources?.length) return NextResponse.json({ error: "Nenhuma fonte Meta ativa com formulário registrado." }, { status: 400 });

  const filtering = encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }]));
  let accepted = 0, duplicates = 0, fetched = 0, recovered = 0, notQueued = 0;
  const perForm: Array<{ formId: string; fetched: number; accepted: number; duplicates: number; recovered: number; notQueued: number }> = [];

  for (const source of sources) {
    const formId = source.form_id as string;
    // Token SEMPRE via header (nunca na query string — evita vazar em log de
    // proxy/CDN/acesso). Paginação por cursor próprio em vez de seguir
    // paging.next cru da Meta, que embutiria o token na URL.
    const baseUrl = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(formId)}/leads?limit=100&filtering=${filtering}`;
    let url: string | null = baseUrl;
    let formFetched = 0, formAccepted = 0, formDuplicates = 0, formRecovered = 0, formNotQueued = 0, guard = 0;

    while (url && guard < 50) {
      guard += 1;
      let page: GraphPage;
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
          logger.error("meta.backfill.graph_failed", new Error(`status ${response.status}`), { formId });
          break;
        }
        page = (await response.json()) as GraphPage;
      } catch (err) {
        logger.error("meta.backfill.graph_error", err as Error, { formId });
        break;
      }

      for (const lead of page.data ?? []) {
        if (!lead.id) continue;
        formFetched += 1;
        const receivedAt = lead.created_time ? new Date(lead.created_time).toISOString() : new Date().toISOString();
        const { data: inserted, error: insertError } = await admin
          .from("meta_lead_events")
          .insert({
            organization_id: organizationId,
            source_id: source.id,
            external_lead_id: lead.id,
            page_id: source.page_id,
            form_id: formId,
            ad_id: lead.ad_id || null,
            adset_id: lead.adset_id || null,
            campaign_external_id: lead.campaign_id || null,
            payload: { ...lead, backfill: true },
            received_at: receivedAt,
          })
          .select("id")
          .single();
        if (insertError) {
          if (insertError.code !== "23505") {
            logger.error("meta.backfill.persistence_failed", insertError, { leadgenId: lead.id });
            formNotQueued += 1;
            continue;
          }
          // Já ingerido — mas "ingerido" era só o evento. Mesmo buraco do
          // webhook: sem tarefa no outbox o lead nunca vira registro no CRM, e
          // o backfill existe justamente para recuperar lead que ficou de fora.
          formDuplicates += 1;
          const healed = await ensureMetaLeadFetchTask(admin, { organizationId, externalLeadId: lead.id });
          if (!healed.ok) {
            logger.error("meta.backfill.outbox_recovery_failed", new Error(healed.reason), { leadgenId: lead.id, code: healed.code });
            formNotQueued += 1;
          } else if (healed.state === "created") {
            formRecovered += 1;
          }
          continue;
        }
        const queued = await ensureOutboxTask(admin, {
          organizationId,
          topic: "meta.lead.fetch",
          aggregateType: "meta_lead_event",
          aggregateId: inserted.id,
          payload: { externalLeadId: lead.id },
        });
        // `accepted` significa ENFILEIRADO. Antes o insert do outbox nem tinha o
        // erro conferido e o contador subia de qualquer jeito: o operador lia
        // "accepted: N" sobre leads que nenhum worker jamais buscaria.
        if (!queued.ok) {
          logger.error("meta.backfill.outbox_failed", new Error(queued.reason), { eventId: inserted.id, leadgenId: lead.id, code: queued.code });
          formNotQueued += 1;
          continue;
        }
        formAccepted += 1;
      }
      const after = page.paging?.cursors?.after;
      url = after ? `${baseUrl}&after=${encodeURIComponent(after)}` : null;
    }

    fetched += formFetched; accepted += formAccepted; duplicates += formDuplicates; recovered += formRecovered; notQueued += formNotQueued;
    perForm.push({ formId, fetched: formFetched, accepted: formAccepted, duplicates: formDuplicates, recovered: formRecovered, notQueued: formNotQueued });
  }

  logger.info("meta.backfill.completed", { organizationId, sinceUnix, fetched, accepted, duplicates, recovered, notQueued });
  return NextResponse.json({
    ok: true,
    sinceUnix,
    since: new Date(sinceUnix * 1000).toISOString(),
    forms: sources.length,
    fetched,
    accepted,
    duplicates,
    recovered,
    notQueued,
    perForm,
    note: "Leads enfileirados na mesma esteira do webhook; o worker /api/v2/outbox/process cria o registro no CRM.",
    counterMeaning: {
      accepted: "evento novo COM tarefa confirmada no outbox",
      duplicates: "evento já existia (pode ter sido só o evento, sem tarefa)",
      recovered: "duplicado cuja tarefa faltava e foi criada agora",
      notQueued: "lido da Meta e NÃO enfileirado — nenhum worker vai buscar; reexecute o backfill",
    },
  });
}
