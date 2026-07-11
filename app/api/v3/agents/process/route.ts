import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && token === expected);
}

function executeAgent(agentKey: string, input: Record<string, unknown>) {
  switch (agentKey) {
    case "sales-agent":
      return { summary: "Lead priorizado e próximo passo comercial preparado.", action: "create_follow_up", input };
    case "marketing-agent":
      return { summary: "Campanha analisada e recomendação de otimização preparada.", action: "review_campaign", input };
    case "manager-agent":
      return { summary: "Risco operacional consolidado para revisão do gestor.", action: "review_operational_risk", input };
    case "investor-agent":
      return { summary: "Ativos avaliados por preço, liquidez e aderência ao perfil.", action: "rank_properties", input };
    default:
      return { summary: "Análise concluída pelo agente genérico.", action: "review_output", input };
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const admin = getSupabaseAdmin();
  const workerId = `agent-${crypto.randomUUID()}`;
  const { data: runs, error } = await admin
    .from("atlas_agent_runs")
    .select("id,organization_id,agent_key,objective,input,attempts,max_attempts,decision_id")
    .eq("status", "queued")
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let completed = 0;
  let failed = 0;

  for (const run of runs ?? []) {
    const attempts = Number(run.attempts ?? 0) + 1;
    await admin.from("atlas_agent_runs").update({
      status: "running",
      attempts,
      locked_at: new Date().toISOString(),
      locked_by: workerId,
      started_at: new Date().toISOString(),
    }).eq("id", run.id).eq("status", "queued");

    try {
      const output = executeAgent(run.agent_key, (run.input ?? {}) as Record<string, unknown>);
      const requiresApproval = ["marketing-agent", "manager-agent"].includes(run.agent_key);
      await admin.from("atlas_agent_runs").update({
        status: requiresApproval ? "waiting_approval" : "completed",
        output,
        completed_at: requiresApproval ? null : new Date().toISOString(),
        error: null,
      }).eq("id", run.id);

      if (run.decision_id) {
        await admin.from("atlas_decisions").update({
          status: requiresApproval ? "proposed" : "completed",
          result: output,
          executed_at: requiresApproval ? null : new Date().toISOString(),
        }).eq("id", run.decision_id).eq("organization_id", run.organization_id);
      }

      completed += 1;
    } catch (processingError) {
      const terminal = attempts >= Number(run.max_attempts ?? 3);
      const message = processingError instanceof Error ? processingError.message : "Falha desconhecida";
      await admin.from("atlas_agent_runs").update({
        status: terminal ? "failed" : "queued",
        available_at: terminal ? new Date().toISOString() : new Date(Date.now() + attempts * 60_000).toISOString(),
        error: message,
        locked_at: null,
        locked_by: null,
      }).eq("id", run.id);
      failed += 1;
      logger.error("v3.agent_run_failed", processingError, { runId: run.id, agentKey: run.agent_key, attempts });
    }
  }

  logger.info("v3.agent_worker_completed", { workerId, processed: runs?.length ?? 0, completed, failed });
  return NextResponse.json({ workerId, processed: runs?.length ?? 0, completed, failed });
}
