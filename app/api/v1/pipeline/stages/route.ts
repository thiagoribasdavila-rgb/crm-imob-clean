import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  canonicalPipelineStage,
  mergePipelineStageSettings,
  type PipelineStageKey,
} from "@/lib/atlas/pipeline-stages";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type StageInput = {
  key?: unknown;
  label?: unknown;
  probability?: unknown;
  position?: unknown;
  visible?: unknown;
};

type StageRow = {
  organization_id: string;
  stage_key: PipelineStageKey;
  label: string;
  probability: number;
  position: number;
  visible: boolean;
  updated_by: string;
  updated_at: string;
};

function canManageStages(accessRole: string, commercialRole: string | null) {
  return accessRole === "admin"
    || commercialRole === "director"
    || commercialRole === "superintendent";
}

function parseStages(
  value: unknown,
  organizationId: string,
  actorId: string,
): StageRow[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 9) return null;
  const updatedAt = new Date().toISOString();
  const rows: StageRow[] = [];
  for (const raw of value) {
    const stage = (raw ?? {}) as StageInput;
    const stageKey = canonicalPipelineStage(
      typeof stage.key === "string" ? stage.key : "",
    );
    if (!stageKey) return null;
    rows.push({
      organization_id: organizationId,
      stage_key: stageKey,
      label: typeof stage.label === "string"
        ? stage.label.trim().slice(0, 40)
        : "",
      probability: Math.round(Number(stage.probability)),
      position: Math.round(Number(stage.position)),
      visible: stage.visible !== false,
      updated_by: actorId,
      updated_at: updatedAt,
    });
  }
  const uniqueKeys = new Set(rows.map((row) => row.stage_key));
  if (
    uniqueKeys.size !== rows.length
    || rows.some((row) =>
      !row.label
      || !Number.isFinite(row.probability)
      || row.probability < 0
      || row.probability > 100
      || !Number.isFinite(row.position)
      || row.position < 1
      || row.position > 999
    )
  ) return null;
  return rows;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    scope: "pipeline.stages.read",
  });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const result = await identity.supabase
    .from("pipeline_stage_settings")
    .select("stage_key,label,probability,position,visible")
    .eq("organization_id", identity.access.organization.id);
  if (result.error) {
    structuredApiLog("error", "pipeline.stages_read_failed", request, identity.meta, {
      organizationId: identity.access.organization.id,
      message: result.error.message,
    });
    return apiError(
      "PIPELINE_STAGES_LOAD_FAILED",
      "Não foi possível carregar a personalização do funil agora.",
      identity.meta,
      { status: 503, headers: rate.headers },
    );
  }

  return apiSuccess({
    stages: mergePipelineStageSettings(result.data ?? []),
    fallback: !result.data?.length,
    permissions: {
      canEdit: canManageStages(
        identity.access.profile.accessRole,
        identity.access.profile.commercialRole,
      ),
    },
  }, identity.meta, { headers: rate.headers });
}

export async function PUT(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 10,
    windowMs: 60_000,
    scope: "pipeline.stages.write",
  });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!canManageStages(
    identity.access.profile.accessRole,
    identity.access.profile.commercialRole,
  )) {
    return apiError(
      "FORBIDDEN",
      "Somente a liderança estratégica pode configurar as etapas.",
      identity.meta,
      { status: 403, headers: rate.headers },
    );
  }

  const body = await request.json().catch(() => null) as {
    stages?: unknown;
  } | null;
  const organizationId = identity.access.organization.id;
  const rows = parseStages(
    body?.stages,
    organizationId,
    identity.access.profile.id,
  );
  if (!rows) {
    return apiError(
      "INVALID_PIPELINE_STAGES",
      "Revise os rótulos, a ordem e as probabilidades das etapas.",
      identity.meta,
      { status: 400, headers: rate.headers },
    );
  }

  const admin = getSupabaseAdmin();
  const previous = await admin
    .from("pipeline_stage_settings")
    .select("organization_id,stage_key,label,probability,position,visible,updated_by,updated_at")
    .eq("organization_id", organizationId)
    .in("stage_key", rows.map((row) => row.stage_key));
  if (previous.error) {
    structuredApiLog("error", "pipeline.stages_snapshot_failed", request, identity.meta, {
      organizationId,
      message: previous.error.message,
    });
    return apiError(
      "PIPELINE_STAGES_SAVE_UNAVAILABLE",
      "Não foi possível preparar a alteração com segurança.",
      identity.meta,
      { status: 503, headers: rate.headers },
    );
  }

  const upsert = await admin
    .from("pipeline_stage_settings")
    .upsert(rows, { onConflict: "organization_id,stage_key" });
  if (upsert.error) {
    structuredApiLog("error", "pipeline.stages_update_failed", request, identity.meta, {
      organizationId,
      message: upsert.error.message,
    });
    return apiError(
      "PIPELINE_STAGES_SAVE_FAILED",
      "Não foi possível salvar a configuração do funil.",
      identity.meta,
      { status: 503, headers: rate.headers },
    );
  }

  const changedStageKeys = rows.map((row) => row.stage_key);
  const audit = await admin.from("atlas_events").insert({
    organization_id: organizationId,
    event_type: "pipeline.settings_updated",
    source: "atlas-pipeline",
    aggregate_type: "organization",
    aggregate_id: organizationId,
    payload: {
      actorId: identity.access.profile.id,
      changedStageKeys,
    },
    correlation_id: identity.meta.correlationId,
  });
  if (audit.error) {
    const priorRows = (previous.data ?? []) as StageRow[];
    const priorKeys = new Set(priorRows.map((row) => row.stage_key));
    const insertedKeys = rows
      .map((row) => row.stage_key)
      .filter((stageKey) => !priorKeys.has(stageKey));
    const [restorePrevious, removeInserted] = await Promise.all([
      priorRows.length
        ? admin.from("pipeline_stage_settings").upsert(priorRows, {
          onConflict: "organization_id,stage_key",
        })
        : Promise.resolve({ error: null }),
      insertedKeys.length
        ? admin
          .from("pipeline_stage_settings")
          .delete()
          .eq("organization_id", organizationId)
          .in("stage_key", insertedKeys)
        : Promise.resolve({ error: null }),
    ]);
    const rollbackFailed = Boolean(
      restorePrevious.error || removeInserted.error,
    );
    structuredApiLog("error", "pipeline.stages_audit_failed", request, identity.meta, {
      organizationId,
      auditMessage: audit.error.message,
      rollbackFailed,
      restoreMessage: restorePrevious.error?.message,
      removeMessage: removeInserted.error?.message,
    });
    return apiError(
      "PIPELINE_STAGES_AUDIT_FAILED",
      rollbackFailed
        ? "A configuração requer revisão administrativa antes de novo uso."
        : "A alteração foi desfeita porque a auditoria não estava disponível.",
      identity.meta,
      { status: 503, headers: rate.headers },
    );
  }

  structuredApiLog("info", "pipeline.stages_updated", request, identity.meta, {
    organizationId,
    actorId: identity.access.profile.id,
    changedStageKeys,
  });
  return apiSuccess({
    stages: mergePipelineStageSettings(rows),
    updated: rows.length,
    audited: true,
  }, identity.meta, { headers: rate.headers });
}
