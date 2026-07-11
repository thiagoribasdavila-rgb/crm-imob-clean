import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runSimulation } from "@/lib/atlas2030/simulation-engine";
import type { SimulationRequest } from "@/lib/atlas2030/contracts";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request, "atlas2030-simulation"), { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Limite de simulações excedido." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) } },
    );
  }

  try {
    const identity = await requireApiIdentity(request);
    const body = (await request.json()) as SimulationRequest;
    if (!body.type || !body.name?.trim() || !Array.isArray(body.scenarios) || body.scenarios.length === 0) {
      return NextResponse.json({ error: "type, name e ao menos um cenário são obrigatórios." }, { status: 400 });
    }
    if (body.scenarios.length > 50) {
      return NextResponse.json({ error: "Máximo de 50 cenários por execução." }, { status: 400 });
    }

    const outcomes = runSimulation(body);
    const ranked = [...outcomes].sort((a, b) => b.score - a.score);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("atlas_simulations")
      .insert({
        organization_id: identity.organizationId,
        simulation_type: body.type,
        name: body.name.trim(),
        baseline: body.baseline ?? {},
        assumptions: body.assumptions ?? {},
        scenarios: body.scenarios,
        result: { outcomes, bestScenario: ranked[0] ?? null },
        confidence: outcomes.length ? Math.round(outcomes.reduce((sum, item) => sum + item.score, 0) / outcomes.length) : 0,
        status: "completed",
        requested_by: identity.userId,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select("id,status,confidence,created_at")
      .single();

    if (error) throw error;
    logger.info("atlas2030.simulation_completed", { simulationId: data.id, organizationId: identity.organizationId, scenarios: outcomes.length });
    return NextResponse.json({ ...data, outcomes, bestScenario: ranked[0] ?? null }, { status: 201 });
  } catch (error) {
    logger.error("atlas2030.simulation_failed", error);
    const message = error instanceof Error ? error.message : "Falha ao executar simulação.";
    const status = /token|sessão|autoriz/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
