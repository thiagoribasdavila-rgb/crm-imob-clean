// app/api/v1/integrations/meta/backfill/route.ts
// -----------------------------------------------------------------------------
// A PORTA DO DIRETOR para o backfill da Meta.
//
// Puxa os leads que JÁ entraram nos formulários e ainda não estão no CRM, pela
// MESMA esteira do webhook: grava em meta_lead_events (dedup) e enfileira
// meta.lead.fetch no outbox, de forma que o worker (/api/v2/outbox/process) crie
// o lead exatamente como no tempo real. Idempotente: reexecutar não duplica.
//
// A LÓGICA NÃO MORA AQUI — mora em lib/meta/backfill.ts, porque existe uma
// segunda porta: /api/v2/marketing/meta-backfill/process, chamada pelo cron com
// ATLAS_CRON_SECRET. A Página da Inside não tem webhook (a inscrição exige a
// tarefa MANAGE, que só o dono da Página concede), então lá o backfill é a ÚNICA
// entrada e precisa rodar sozinho. Duas portas, uma esteira: copiar a lógica
// para o worker seria repetir de propósito a classe "caminhos divergentes", que
// este repositório já pagou caro.
//
// POST /api/v1/integrations/meta/backfill
//   body: { sinceUnix?: number, pageId?: string }   // default: início de hoje (America/Sao_Paulo)
// -----------------------------------------------------------------------------
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAccessContext, enforceRateLimit } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { executarBackfillMeta, inicioDeHojeSaoPaulo } from "@/lib/meta/backfill";

export const dynamic = "force-dynamic";

function canManage(role: string | null, legacyRole: string) {
  return ["director", "superintendent", "manager"].includes(role || "") || ["admin", "manager"].includes(legacyRole);
}

export async function POST(request: NextRequest) {
  // Backfill pagina a Graph em lote (até 50 páginas × 100 leads POR formulário).
  // Clique repetido estoura cota da Meta e pode marcar o token. Três por minuto
  // é generoso para uma operação que se faz uma vez por onda.
  const rate = enforceRateLimit(request, { limit: 3, windowMs: 60_000, scope: "meta.backfill" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManage(access.access.profile.commercialRole, access.access.profile.role)) {
    return NextResponse.json({ error: "Permissão insuficiente para executar o backfill Meta." }, { status: 403 });
  }

  const accessToken = process.env.META_LEAD_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  if (!accessToken) return NextResponse.json({ error: "META_LEAD_ACCESS_TOKEN ausente." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { sinceUnix?: number; pageId?: string };
  const sinceUnix = Number.isFinite(body.sinceUnix) ? Number(body.sinceUnix) : inicioDeHojeSaoPaulo();

  const resultado = await executarBackfillMeta({
    admin: getSupabaseAdmin(),
    organizationId: access.access.organization.id,
    sinceUnix,
    accessToken,
    apiVersion,
    pageId: body.pageId ?? null,
  });

  if ("erro" in resultado) {
    return NextResponse.json({ error: resultado.erro }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    sinceUnix,
    since: new Date(sinceUnix * 1000).toISOString(),
    forms: resultado.formularios,
    // Nomes preservados: a represa (/api/v1/marketing/held-leads) e os scripts de
    // prova já leem estas chaves. Renomear quebraria chamadores vivos sem ganho.
    fetched: resultado.lidas,
    accepted: resultado.enfileiradas,
    duplicates: resultado.duplicadas,
    recovered: resultado.reparadas,
    notQueued: resultado.naoEnfileiradas,
    // Formulário que a Graph recusou. Antes isto era um `break` mudo, e o
    // operador lia "0 lidas" como "nada novo" em vez de "não consegui olhar".
    formulariosComFalha: resultado.formulariosComFalha,
    parcial: resultado.formulariosComFalha.length > 0,
    perForm: resultado.porFormulario,
    note: "Leads enfileirados na mesma esteira do webhook; o worker /api/v2/outbox/process cria o registro no CRM.",
    counterMeaning: {
      accepted: "evento novo COM tarefa confirmada no outbox",
      duplicates: "evento já existia (pode ter sido só o evento, sem tarefa)",
      recovered: "duplicado cuja tarefa faltava e foi criada agora",
      notQueued: "lido da Meta e NÃO enfileirado — nenhum worker vai buscar; reexecute o backfill",
      formulariosComFalha: "a Graph recusou a consulta destes formulários — o total está INCOMPLETO",
    },
  });
}
