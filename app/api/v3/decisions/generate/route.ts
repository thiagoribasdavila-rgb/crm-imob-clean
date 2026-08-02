import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { campaignDecision, leadDecision, overdueTaskDecision, type DecisionCandidate } from "@/lib/atlas/decision-engine";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && token === expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  try {
    const admin = getSupabaseAdmin();
    // `organizations.status` está gravado em CAIXA ALTA ("ACTIVE") nas 2 organizações
    // vivas. Com `.eq("status","active")` o filtro casava com ZERO linhas, o laço
    // abaixo nunca rodava e a rota respondia 200 com `generated: 0` — o mesmo silêncio
    // da coluna errada, só que por valor. `ilike` sem curinga é igualdade sem caixa.
    const { data: organizations, error: orgError } = await admin.from("organizations").select("id").ilike("status", "active");
    if (orgError) throw orgError;
    if (!organizations?.length) {
      logger.warn("v3.decisions_no_active_organizations", { hint: "nenhuma organização casou com status ~ 'active'" });
    }

    let generated = 0;
    let skipped = 0;

    for (const organization of organizations ?? []) {
      const [leadsResult, tasksResult, campaignsResult] = await Promise.all([
        admin.from("leads").select("id,name,score,temperature,status").eq("organization_id", organization.id).order("score", { ascending: false }).limit(100),
        // A coluna real de `public.tasks` é `due_date`. Pedindo `due_at` o PostgREST
        // devolvia 42703, o `?? []` abaixo transformava o erro em zero candidatos e
        // NENHUMA decisão de tarefa atrasada era gerada — sem erro, sem log.
        admin.from("tasks").select("id,title,status,due_date,priority").eq("organization_id", organization.id).not("due_date", "is", null).limit(100),
        admin.from("campaigns").select("id,name,status,spend,leads_count").eq("organization_id", organization.id).limit(100),
      ]);

      // Sem esta verificação, qualquer falha de leitura vira lista vazia e o endpoint
      // responde 200 com `generated: 0`, indistinguível de "não havia o que gerar".
      for (const [source, sourceError] of [
        ["leads", leadsResult.error],
        ["tasks", tasksResult.error],
        ["campaigns", campaignsResult.error],
      ] as const) {
        if (!sourceError) continue;
        logger.error("v3.decisions_source_failed", sourceError, { organizationId: organization.id, source });
        throw new Error(`Falha ao ler ${source} da organização ${organization.id}: ${sourceError.message}`);
      }

      const candidates: DecisionCandidate[] = [
        ...(leadsResult.data ?? []).map(leadDecision),
        ...(tasksResult.data ?? []).map(overdueTaskDecision),
        ...(campaignsResult.data ?? []).map((campaign) => campaignDecision(campaign)),
      ].filter((candidate): candidate is DecisionCandidate => Boolean(candidate));

      for (const candidate of candidates) {
        const { error } = await admin.from("atlas_decisions").insert({
          organization_id: organization.id,
          decision_key: candidate.key,
          source_type: candidate.sourceType,
          source_id: candidate.sourceId,
          decision_type: candidate.decisionType,
          priority: candidate.priority,
          title: candidate.title,
          rationale: candidate.rationale,
          recommended_action: candidate.recommendedAction,
          evidence: candidate.evidence,
          confidence: candidate.confidence,
          requires_approval: candidate.requiresApproval,
          expires_at: candidate.expiresAt,
        });

        if (error?.code === "23505") skipped += 1;
        else if (error) throw error;
        else generated += 1;
      }
    }

    logger.info("v3.decisions_generated", { generated, skipped, organizations: organizations?.length ?? 0 });
    return NextResponse.json({ generated, skipped, organizations: organizations?.length ?? 0 });
  } catch (error) {
    logger.error("v3.decisions_generation_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao gerar decisões." }, { status: 500 });
  }
}
