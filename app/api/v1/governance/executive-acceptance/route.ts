import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { homologationChecklist } from "@/lib/atlas/homologation-checklist";
import {
  evaluateExecutiveAcceptance,
  executiveRoles,
  type ExecutiveRole,
} from "@/lib/governance/executive-homologation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const roleOf = (profile: {
  role?: string | null;
  commercialRole?: string | null;
}) =>
  (profile.commercialRole ||
    (profile.role === "admin" ? "director" : profile.role)) as ExecutiveRole;

async function collect(org: string, cycleId?: string) {
  const db = getSupabaseAdmin();
  const [
    { data: results },
    { data: reliability },
    { data: integration },
    { count: restores },
    { count: rollbacks },
    { count: leads },
    { count: developments },
    { data: signoffs },
  ] = await Promise.all([
    db
      .from("homologation_results")
      .select("check_key,outcome,verified_at")
      .eq("organization_id", org)
      .order("verified_at", { ascending: false }),
    db
      .from("reliability_release_snapshots")
      .select("status,created_at")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("integration_health_snapshots")
      .select("summary,created_at")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("homologation_backup_evidence")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("restore_status", "passed"),
    db
      .from("v2_rollback_drills")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("status", "passed"),
    db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org),
    db
      .from("developments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org),
    cycleId
      ? db
          .from("executive_homologation_signoffs")
          .select(
            "commercial_role,outcome,signed_by,signed_at,evidence_reference,notes",
          )
          .eq("organization_id", org)
          .eq("cycle_id", cycleId)
          .order("signed_at")
      : Promise.resolve({ data: [] }),
  ]);
  const latest = new Map<string, string>();
  for (const result of results || [])
    if (!latest.has(result.check_key))
      latest.set(result.check_key, result.outcome);
  const passed = homologationChecklist.filter(
    (check) => latest.get(check.key) === "passed",
  ).length;
  const failed = homologationChecklist.filter(
    (check) => latest.get(check.key) === "failed",
  ).length;
  const passedRoles = (signoffs || [])
    .filter((item) => item.outcome === "passed")
    .map((item) => item.commercial_role)
    .filter((role): role is ExecutiveRole =>
      executiveRoles.includes(role as ExecutiveRole),
    );
  const evidence = {
    homologationTotal: latest.size,
    homologationPassed: passed,
    homologationFailed: failed,
    requiredChecks: homologationChecklist.length,
    signedRoles: passedRoles,
    reliabilityReady: reliability?.status === "ready_for_homologation",
    integrationReady: integration?.summary?.productionReady === true,
    backupRestorePassed: (restores || 0) > 0,
    rollbackPassed: (rollbacks || 0) > 0,
    realDataReady: (leads || 0) > 0 && (developments || 0) > 0,
    hostinger: process.env.ATLAS_HOSTING_PROVIDER === "hostinger",
    https: /^https:\/\//.test(process.env.ATLAS_BASE_URL || ""),
  };
  return {
    evidence,
    assessment: evaluateExecutiveAcceptance(evidence),
    signoffs: signoffs || [],
    freshness: {
      reliabilityAt: reliability?.created_at || null,
      integrationAt: integration?.created_at || null,
    },
  };
}

export async function GET(req: NextRequest) {
  const rate = enforceRateLimit(req, {
    limit: 30,
    scope: "executive-acceptance.read",
  });
  if (!rate.ok) return rate.response;
  const a = await requireAccessContext(req);
  if (!a.ok) return a.response;
  const role = roleOf(a.access.profile);
  if (!executiveRoles.includes(role))
    return apiError(
      "ROLE_NOT_ELIGIBLE",
      "Perfil sem participação no aceite executivo.",
      a.meta,
      { status: 403 },
    );
  const db = getSupabaseAdmin(),
    { data: cycles, error } = await db
      .from("executive_homologation_cycles")
      .select(
        "id,release_version,status,score,blocking,created_at,decided_at,decision_reason,decided_by",
      )
      .eq("organization_id", a.access.organization.id)
      .order("created_at", { ascending: false })
      .limit(20);
  if (error)
    return apiError(
      "EXECUTIVE_ACCEPTANCE_UNAVAILABLE",
      "Aplique a migration da Fase 99.",
      a.meta,
      { status: 503 },
    );
  const active = (cycles || []).find((cycle) =>
    ["collecting", "ready_for_decision"].includes(cycle.status),
  );
  const current = await collect(a.access.organization.id, active?.id);
  return apiSuccess(
    {
      current,
      cycles: cycles || [],
      activeCycle: active || null,
      currentUser: { id: a.access.profile.id, role },
      policy: {
        directorDecisionOnly: true,
        oneSignoffPerRole: true,
        failedOrPendingBlocksGo: true,
        automaticPublish: false,
        secretsReturned: false,
      },
    },
    a.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const rate = enforceRateLimit(req, {
    limit: 12,
    scope: "executive-acceptance.write",
  });
  if (!rate.ok) return rate.response;
  const a = await requireAccessContext(req);
  if (!a.ok) return a.response;
  const role = roleOf(a.access.profile);
  if (!executiveRoles.includes(role))
    return apiError(
      "ROLE_NOT_ELIGIBLE",
      "Perfil sem participação no aceite.",
      a.meta,
      { status: 403 },
    );
  let body: {
    action?: string;
    cycleId?: string;
    releaseVersion?: string;
    outcome?: string;
    evidenceReference?: string;
    notes?: string;
    decision?: string;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiError("INVALID_JSON", "Envie JSON válido.", a.meta, {
      status: 400,
    });
  }
  const db = getSupabaseAdmin(),
    org = a.access.organization.id;
  if (body.action === "start") {
    if (role !== "director")
      return apiError(
        "DIRECTOR_REQUIRED",
        "Somente o diretor inicia o ciclo.",
        a.meta,
        { status: 403 },
      );
    const { data: existing } = await db
      .from("executive_homologation_cycles")
      .select("id")
      .eq("organization_id", org)
      .in("status", ["collecting", "ready_for_decision"])
      .limit(1)
      .maybeSingle();
    if (existing)
      return apiError(
        "ACTIVE_CYCLE_EXISTS",
        "Conclua o ciclo ativo antes de iniciar outro.",
        a.meta,
        { status: 409 },
      );
    const current = await collect(org),
      releaseVersion = String(body.releaseVersion || "").trim();
    if (releaseVersion.length < 2)
      return apiError(
        "RELEASE_REQUIRED",
        "Informe a versão candidata.",
        a.meta,
        { status: 400 },
      );
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          releaseVersion,
          evidence: current.evidence,
          at: new Date().toISOString(),
        }),
      )
      .digest("hex");
    const { data, error } = await db
      .from("executive_homologation_cycles")
      .insert({
        organization_id: org,
        release_version: releaseVersion.slice(0, 80),
        status: current.assessment.status,
        score: current.assessment.score,
        evidence_snapshot: current.evidence,
        controls: current.assessment.controls,
        blocking: current.assessment.blocking,
        evidence_hash: hash,
        created_by: a.access.profile.id,
      })
      .select("id,release_version,status,score,blocking,created_at")
      .single();
    if (error)
      return apiError(
        "CYCLE_START_FAILED",
        "Não foi possível iniciar o ciclo.",
        a.meta,
        { status: 409 },
      );
    return apiSuccess({ cycle: data, productionPublished: false }, a.meta, {
      status: 201,
      headers: rate.headers,
    });
  }
  if (!body.cycleId)
    return apiError("CYCLE_REQUIRED", "Informe o ciclo ativo.", a.meta, {
      status: 400,
    });
  const { data: cycle } = await db
    .from("executive_homologation_cycles")
    .select("id,status")
    .eq("id", body.cycleId)
    .eq("organization_id", org)
    .maybeSingle();
  if (!cycle || !["collecting", "ready_for_decision"].includes(cycle.status))
    return apiError("CYCLE_CLOSED", "Ciclo inexistente ou encerrado.", a.meta, {
      status: 409,
    });
  if (body.action === "signoff") {
    const notes = String(body.notes || "").trim(),
      reference = String(body.evidenceReference || "").trim();
    if (
      !["passed", "failed"].includes(body.outcome || "") ||
      notes.length < 20 ||
      reference.length < 8
    )
      return apiError(
        "INVALID_SIGNOFF",
        "Informe resultado, referência e observação detalhada.",
        a.meta,
        { status: 400 },
      );
    const { data, error } = await db
      .from("executive_homologation_signoffs")
      .insert({
        organization_id: org,
        cycle_id: cycle.id,
        commercial_role: role,
        outcome: body.outcome,
        evidence_reference: reference.slice(0, 500),
        notes: notes.slice(0, 2000),
        signed_by: a.access.profile.id,
      })
      .select("id,commercial_role,outcome,signed_at")
      .single();
    if (error)
      return apiError(
        "SIGNOFF_CONFLICT",
        "Este perfil já assinou o ciclo; a evidência é imutável.",
        a.meta,
        { status: 409 },
      );
    const current = await collect(org, cycle.id);
    await db
      .from("executive_homologation_cycles")
      .update({
        status: current.assessment.status,
        score: current.assessment.score,
        evidence_snapshot: current.evidence,
        controls: current.assessment.controls,
        blocking: current.assessment.blocking,
      })
      .eq("id", cycle.id)
      .eq("organization_id", org);
    return apiSuccess(
      {
        signoff: data,
        status: current.assessment.status,
        productionPublished: false,
      },
      a.meta,
      { status: 201, headers: rate.headers },
    );
  }
  if (body.action === "decide") {
    if (role !== "director")
      return apiError(
        "DIRECTOR_REQUIRED",
        "Somente o diretor registra a decisão.",
        a.meta,
        { status: 403 },
      );
    const decision = body.decision,
      reason = String(body.reason || "").trim();
    if (!["go", "no_go"].includes(decision || "") || reason.length < 30)
      return apiError(
        "INVALID_DECISION",
        "Informe GO/NO-GO e justificativa com ao menos 30 caracteres.",
        a.meta,
        { status: 400 },
      );
    const current = await collect(org, cycle.id);
    if (decision === "go" && !current.assessment.goAllowed)
      return apiError(
        "GO_BLOCKED",
        "Existem controles pendentes ou reprovados.",
        a.meta,
        { status: 409, details: current.assessment.blocking },
      );
    const { data, error } = await db
      .from("executive_homologation_cycles")
      .update({
        status: decision,
        score: current.assessment.score,
        evidence_snapshot: current.evidence,
        controls: current.assessment.controls,
        blocking: current.assessment.blocking,
        decided_by: a.access.profile.id,
        decision_reason: reason.slice(0, 2000),
        decided_at: new Date().toISOString(),
      })
      .eq("id", cycle.id)
      .eq("organization_id", org)
      .select("id,status,score,blocking,decided_at")
      .single();
    if (error)
      return apiError(
        "DECISION_FAILED",
        "Não foi possível registrar a decisão.",
        a.meta,
        { status: 409 },
      );
    return apiSuccess({ decision: data, productionPublished: false }, a.meta, {
      headers: rate.headers,
    });
  }
  return apiError("INVALID_ACTION", "Use start, signoff ou decide.", a.meta, {
    status: 400,
  });
}
