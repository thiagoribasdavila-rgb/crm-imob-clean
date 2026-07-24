import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Devolve à fila as reservas de lead que passaram do prazo de aceite.
 *
 * Sem este worker o aceite é decorativo: `distribute_project_leads_v4` cria a
 * reserva com prazo e responde `acceptanceRequired: true`, mas nada expira —
 * a lead fica com o corretor que não confirmou, e a fila nunca recupera o
 * lead abandonado. É o outro lado do POST accept_assignment.
 *
 * Mesmo contrato dos demais workers: só roda com ATLAS_CRON_SECRET.
 */
export async function POST(request: Request) {
  const expected = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || token !== expected) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  try {
    const { data, error } = await getSupabaseAdmin().rpc("process_expired_lead_reservations", { p_limit: 500 });
    if (error) {
      // Banco sem a fase 58: o worker não é falha operacional, só não tem o que fazer.
      if (error.code === "42883" || error.code === "PGRST202") {
        logger.info("crm.reservation_worker_unavailable", { reason: "process_expired_lead_reservations ausente neste banco" });
        return NextResponse.json({ status: "skipped", reason: "capability-not-deployed" });
      }
      throw error;
    }
    logger.info("crm.reservation_worker_completed", { released: Number((data as Record<string, unknown> | null)?.released || 0) });
    return NextResponse.json({ status: "completed", ...(data as Record<string, unknown> || {}) });
  } catch (error) {
    logger.error("crm.reservation_worker_failed", error);
    return NextResponse.json({ error: "Falha ao processar reservas expiradas." }, { status: 500 });
  }
}
