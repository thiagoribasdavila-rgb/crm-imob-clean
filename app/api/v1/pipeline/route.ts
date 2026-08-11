import { NextResponse } from "next/server";
import {
  requireApiIdentity,
  requireLeadAccess,
  type ApiIdentity,
} from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { recordFunnelLearning } from "@/lib/atlas/funnel-learning";
import { canonicalPipelineStage, mergePipelineStageSettings } from "@/lib/atlas/pipeline-stages";
import {
  LIVE_LEAD_SELECT,
  LIVE_PROFILE_SELECT,
  mapLegacyLead,
} from "@/lib/compat/legacy-v2";
import { recordLiveLeadEvent } from "@/lib/compat/live-writes";
import { readCompatiblePipeline } from "@/lib/atlas/core-v2/live-repositories";
import {
  buildProjectCompatibility,
  type ProjectCompatibility,
} from "@/lib/atlas/project-compatibility";

export const dynamic = "force-dynamic";

const FIRST_CONTACT_SLA_SELECT =
  "id,first_contact_due_at,first_contacted_at,first_contact_sla_minutes,first_response_minutes,first_contact_sla_met";

type ConversationContinuity = {
  channel: string | null;
  channel_confirmed: boolean;
  conversation_status: string | null;
  last_contact_at: string | null;
  response_state: "customer_replied" | "waiting_customer" | "recorded";
};

type ConversationRow = {
  id: string;
  lead_id: string | null;
  channel: string | null;
  status: string | null;
  last_message_at: string | null;
  updated_at: string | null;
};

type MessageEvidenceRow = {
  conversation_id: string;
  direction: string | null;
  channel: string | null;
  status: string | null;
  external_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string | null;
};

type CompatibilityRow = Record<string, unknown>;

function normalizedProjectName(value: unknown) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function chunks<T>(values: T[], size = 100) {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );
}

function timestamp(value: string | null | undefined) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function messageOccurredAt(message: MessageEvidenceRow) {
  return (
    message.read_at ||
    message.delivered_at ||
    message.sent_at ||
    message.created_at
  );
}

function hasChannelEvidence(message: MessageEvidenceRow) {
  return Boolean(
    message.external_message_id ||
      ["sent", "delivered", "read", "received"].includes(
        String(message.status || "").toLowerCase(),
      ),
  );
}

async function readConversationContinuity(
  identity: ApiIdentity,
  leadIds: string[],
): Promise<{
  byLead: Map<string, ConversationContinuity>;
  status: "available" | "unavailable" | "empty";
}> {
  const byLead = new Map<string, ConversationContinuity>();
  const scopedLeadIds = [...new Set(leadIds.filter(Boolean))];
  if (!scopedLeadIds.length) return { byLead, status: "empty" };

  const conversations: ConversationRow[] = [];
  for (const batch of chunks(scopedLeadIds)) {
    const result = await identity.supabase
      .from("conversations")
      .select("id,lead_id,channel,status,last_message_at,updated_at")
      .eq("organization_id", identity.organizationId)
      .in("lead_id", batch)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(batch.length * 5);
    if (result.error) {
      logger.warn("pipeline.conversation_continuity_unavailable", {
        organizationId: identity.organizationId,
        message: result.error.message,
      });
      return { byLead, status: "unavailable" };
    }
    conversations.push(...((result.data ?? []) as ConversationRow[]));
  }

  const latestConversationByLead = new Map<string, ConversationRow>();
  for (const conversation of conversations) {
    const leadId = String(conversation.lead_id || "");
    if (!leadId) continue;
    const current = latestConversationByLead.get(leadId);
    const candidateAt = timestamp(
      conversation.last_message_at || conversation.updated_at,
    );
    const currentAt = timestamp(
      current?.last_message_at || current?.updated_at,
    );
    if (!current || candidateAt > currentAt) {
      latestConversationByLead.set(leadId, conversation);
    }
  }

  const conversationIds = [...latestConversationByLead.values()].map(
    (conversation) => conversation.id,
  );
  const latestMessageByConversation = new Map<string, MessageEvidenceRow>();
  for (const batch of chunks(conversationIds)) {
    const result = await identity.supabase
      .from("messages")
      .select(
        "conversation_id,direction,channel,status,external_message_id,sent_at,delivered_at,read_at,created_at",
      )
      .eq("organization_id", identity.organizationId)
      .in("conversation_id", batch)
      .order("created_at", { ascending: false })
      .limit(batch.length * 10);
    if (result.error) {
      logger.warn("pipeline.message_evidence_unavailable", {
        organizationId: identity.organizationId,
        message: result.error.message,
      });
      return { byLead, status: "unavailable" };
    }
    for (const message of (result.data ?? []) as MessageEvidenceRow[]) {
      const current = latestMessageByConversation.get(message.conversation_id);
      if (
        !current ||
        timestamp(messageOccurredAt(message)) >
          timestamp(messageOccurredAt(current))
      ) {
        latestMessageByConversation.set(message.conversation_id, message);
      }
    }
  }

  for (const [leadId, conversation] of latestConversationByLead) {
    const message = latestMessageByConversation.get(conversation.id);
    const channelConfirmed = Boolean(message && hasChannelEvidence(message));
    const direction = String(message?.direction || "").toLowerCase();
    byLead.set(leadId, {
      channel: channelConfirmed
        ? String(message?.channel || conversation.channel || "") || null
        : null,
      channel_confirmed: channelConfirmed,
      conversation_status: conversation.status,
      last_contact_at:
        (message ? messageOccurredAt(message) : null) ||
        conversation.last_message_at ||
        conversation.updated_at,
      response_state:
        direction === "inbound" && channelConfirmed
          ? "customer_replied"
          : direction === "outbound" && channelConfirmed
            ? "waiting_customer"
            : "recorded",
    });
  }

  return { byLead, status: byLead.size ? "available" : "empty" };
}

async function readProjectCompatibility(
  identity: ApiIdentity,
  leads: CompatibilityRow[],
): Promise<{
  byLead: Map<string, ProjectCompatibility>;
  status: "available" | "partial" | "empty";
}> {
  const byLead = new Map<string, ProjectCompatibility>();
  if (!leads.length) return { byLead, status: "empty" };

  const leadIds = leads.map((lead) => String(lead.id || "")).filter(Boolean);
  const [developmentsResult, legacyProjectsResult, qualificationResult] =
    await Promise.all([
      identity.supabase
        .from("developments")
        .select(
          "id,name,neighborhood,city,state,price_min,price_max,bedrooms_min,bedrooms_max,typologies,product_type,market_segment",
        )
        .eq("organization_id", identity.organizationId)
        .limit(2_000),
      identity.supabase
        .from("crm_projects")
        .select("id,name,neighborhood,city,state")
        .eq("organization_id", identity.organizationId)
        .limit(2_000),
      leadIds.length
        ? identity.supabase
            .from("lead_qualification_profiles")
            .select("lead_id,purpose_key,timeline_key,unit_profile_key")
            .eq("organization_id", identity.organizationId)
            .in("lead_id", leadIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (developmentsResult.error) {
    logger.warn("pipeline.project_compatibility_developments_unavailable", {
      organizationId: identity.organizationId,
      message: developmentsResult.error.message,
    });
  }
  if (legacyProjectsResult.error) {
    logger.warn("pipeline.project_compatibility_legacy_projects_unavailable", {
      organizationId: identity.organizationId,
      message: legacyProjectsResult.error.message,
    });
  }
  if (qualificationResult.error) {
    logger.warn("pipeline.project_compatibility_qualification_unavailable", {
      organizationId: identity.organizationId,
      message: qualificationResult.error.message,
    });
  }

  const canonicalDevelopments = (developmentsResult.error
    ? []
    : developmentsResult.data ?? []) as CompatibilityRow[];
  const legacyProjects = (legacyProjectsResult.error
    ? []
    : legacyProjectsResult.data ?? []) as CompatibilityRow[];
  const projects = [
    ...legacyProjects,
    ...canonicalDevelopments,
  ] as CompatibilityRow[];
  const projectById = new Map(
    projects.map((project) => [String(project.id || ""), project]),
  );
  const projectByName = new Map(
    projects
      .map((project) => [normalizedProjectName(project.name), project] as const)
      .filter(([name]) => Boolean(name)),
  );
  const qualificationByLead = new Map(
    ((qualificationResult.error
      ? []
      : qualificationResult.data ?? []) as CompatibilityRow[]).map(
      (profile) => [String(profile.lead_id || ""), profile],
    ),
  );

  for (const lead of leads) {
    const leadId = String(lead.id || "");
    const developmentId = String(lead.development_id || "");
    const projectName = normalizedProjectName(
      lead.development_name || lead.project_name || lead.project,
    );
    const development =
      projectById.get(developmentId) || projectByName.get(projectName) || null;
    byLead.set(
      leadId,
      buildProjectCompatibility(
        lead,
        development,
        qualificationByLead.get(leadId) || null,
      ),
    );
  }

  const unavailableReads = [
    developmentsResult.error,
    legacyProjectsResult.error,
    qualificationResult.error,
  ].filter(Boolean).length;
  return {
    byLead,
    status: unavailableReads ? "partial" : byLead.size ? "available" : "empty",
  };
}

function authError(error: unknown) {
  const message = error instanceof Error ? error.message : "Não autorizado.";
  const status = /sessão|token|autenticação|organização/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    const compatiblePipeline = await readCompatiblePipeline(identity.supabase, {
      organizationId: identity.organizationId,
      limit: 500,
      includeArchived: false,
    });
    if (!compatiblePipeline.ok) throw new Error(compatiblePipeline.error.code);

    const assignedProfileIds = [
      ...new Set(
        compatiblePipeline.rows
          .map((lead) => String(lead.assigned_to || "").trim())
          .filter(Boolean),
      ),
    ];

    // The base read remains compatible with the pre-DDL V2 schema. Once the
    // first-contact migration is present, enrich the same cards with the
    // measured SLA without making the whole Pipeline depend on the new columns.
    const [
      slaResult,
      assignedProfilesResult,
      continuityResult,
      projectCompatibilityResult,
    ] =
      await Promise.all([
        identity.supabase
          .from("leads")
          .select(FIRST_CONTACT_SLA_SELECT)
          .eq("organization_id", identity.organizationId)
          .limit(5_000),
        assignedProfileIds.length
          ? identity.supabase
              .from("profiles")
              .select(LIVE_PROFILE_SELECT)
              .eq("organization_id", identity.organizationId)
              .in("id", assignedProfileIds)
          : Promise.resolve({ data: [], error: null }),
        readConversationContinuity(
          identity,
          compatiblePipeline.rows.map((lead) => String(lead.id)),
        ),
        readProjectCompatibility(
          identity,
          compatiblePipeline.rows as CompatibilityRow[],
        ),
      ]);
    const slaByLead = new Map(
      (slaResult.error ? [] : slaResult.data ?? []).map((row) => [
        String(row.id),
        row,
      ]),
    );
    const assignedNameById = new Map(
      (assignedProfilesResult.error
        ? []
        : assignedProfilesResult.data ?? []
      ).map((profile) => [
        String(profile.id),
        String(profile.name || "").trim(),
      ]),
    );
    if (assignedProfilesResult.error) {
      logger.warn("pipeline.assigned_profiles_unavailable", {
        organizationId: identity.organizationId,
        message: assignedProfilesResult.error.message,
      });
    }

    let settings: Array<{ stage_key?: string; label?: string; probability?: number; position?: number; visible?: boolean }> = [];
    let stageSettingsSource = "canonical-defaults";
    if (process.env.ATLAS_PIPELINE_STAGE_SETTINGS_ENABLED === "true") {
      const stageSettings = await identity.supabase.from("pipeline_stage_settings").select("stage_key,label,probability,position,visible").eq("organization_id", identity.organizationId);
      if (!stageSettings.error) {
        settings = stageSettings.data ?? [];
        stageSettingsSource = "organization-settings";
      } else logger.warn("pipeline.stage_settings_unavailable", { organizationId: identity.organizationId, message: stageSettings.error.message });
    }
    const role = identity.commercialRole || identity.role;
    const leads = compatiblePipeline.rows
      .map((lead) => ({
        ...lead,
        ...(slaByLead.get(String(lead.id)) ?? {}),
        assigned_name:
          assignedNameById.get(String(lead.assigned_to || "")) || null,
        conversation_continuity:
          continuityResult.byLead.get(String(lead.id)) ?? null,
        project_compatibility:
          projectCompatibilityResult.byLead.get(String(lead.id)) ?? null,
      }))
      .sort(
        (a, b) =>
          Number((b as CompatibilityRow).score || 0) -
          Number((a as CompatibilityRow).score || 0),
      );
    return NextResponse.json({
      leads,
      stages: mergePipelineStageSettings(settings),
      stageContract: "canonical-v1",
      stageSettingsSource,
      compatibility: compatiblePipeline.compatibility,
      firstContactSla: {
        status: slaResult.error ? "awaiting-ddl" : "measured",
        fields: ["first_response_minutes", "first_contact_sla_met"],
      },
      conversationContinuity: {
        status: continuityResult.status,
        privacy: "metadata-only",
        channelRequiresDeliveryEvidence: true,
      },
      projectCompatibility: {
        status: projectCompatibilityResult.status,
        evidenceOnly: true,
        missingDataIsNotLowCompatibility: true,
        aiCost: false,
      },
      pagination: {
        loaded: leads.length,
        totalOperational: compatiblePipeline.count,
        archivedMemoryExcluded: true,
        limit: 500,
      },
      canConfigureStages: ["admin", "director", "superintendent"].includes(String(role || "")),
    });
  } catch (error) {
    logger.warn("pipeline.read_failed", { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : "";
    if (!/sessão|token|autenticação|organização|escopo/i.test(message)) return NextResponse.json({ error: "Pipeline temporariamente indisponível. O Atlas registrou o problema. Tente novamente." }, { status: 503 });
    return authError(error);
  }
}

export async function PATCH(request: Request) {
  const rate = checkRateLimit(clientKey(request, "v1-pipeline-move"), { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas movimentações em sequência." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) } },
    );
  }

  try {
    const identity = await requireApiIdentity(request);
    const body = await request.json();
    const leadId = String(body.leadId || "");
    const stage = canonicalPipelineStage(body.stage);
    const expectedFromStage = canonicalPipelineStage(body.expectedFromStage);
    const reversalOf = typeof body.reversalOf === "string" && /^[0-9a-f-]{36}$/i.test(body.reversalOf) ? body.reversalOf : null;
    const followUpDescription = String(body.followUpDescription || "").trim().slice(0, 4000);
    const source = body.source === "atlas-copilot" ? "atlas-copilot" : "pipeline";
    const humanConfirmed = body.humanConfirmed === true;

    if (!leadId || !stage || !expectedFromStage || (stage === "comprou_outro" && followUpDescription.length < 10)) {
      return NextResponse.json({ error: "Lead ou etapa inválida." }, { status: 400 });
    }
    if (source === "atlas-copilot" && !humanConfirmed) {
      return NextResponse.json(
        {
          error: "A movimentação sugerida pelo Copilot exige confirmação humana explícita.",
          code: "COPILOT_PIPELINE_CONFIRMATION_REQUIRED",
        },
        { status: 400 },
      );
    }

    await requireLeadAccess(identity, leadId);

    const admin = getSupabaseAdmin();
    const { data: current } = await identity.supabase
      .from("leads")
      .select("id,name,status,organization_id")
      .eq("id", leadId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (!current) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    const previousStage = canonicalPipelineStage(current.status) || "novo";
    if (previousStage !== expectedFromStage) return NextResponse.json({ error: "A lead foi movimentada por outra pessoa. Atualize o Kanban antes de tentar novamente.", code: "PIPELINE_STAGE_CONFLICT", currentStage: previousStage }, { status: 409 });
    if (reversalOf) {
      const { data: reversibleMove, error: reversalError } = await admin
        .from("pipeline_history")
        .select("id,lead_id,old_status,new_status,changed_by,created_at")
        .eq("id", reversalOf)
        .eq("lead_id", leadId)
        .eq("organization_id", identity.organizationId)
        .maybeSingle();
      if (reversalError || !reversibleMove || canonicalPipelineStage(reversibleMove.new_status) !== previousStage || canonicalPipelineStage(reversibleMove.old_status) !== stage) {
        return NextResponse.json({ error: "A movimentação mudou e não pode mais ser desfeita sem atualizar o Kanban.", code: "PIPELINE_STAGE_CONFLICT" }, { status: 409 });
      }
    }

    // The live V2 database does not expose the planned move_pipeline_lead RPC.
    // We therefore use a compensating write: the stage is changed first and is
    // restored immediately if the mandatory audit row cannot be persisted.
    const { data: updated, error: updateError } = await admin
      .from("leads")
      .update({ status: stage })
      .eq("id", leadId)
      .eq("organization_id", identity.organizationId)
      .eq("status", current.status)
      .select(LIVE_LEAD_SELECT)
      .maybeSingle();
    if (updateError || !updated) {
      return NextResponse.json({ error: "A oportunidade mudou em outra sessão. Atualize o Kanban e tente novamente.", code: "PIPELINE_STAGE_CONFLICT", currentStage: previousStage }, { status: 409 });
    }

    const occurredAt = new Date().toISOString();
    const { data: history, error: historyError } = await admin
      .from("pipeline_history")
      .insert({
        organization_id: identity.organizationId,
        lead_id: leadId,
        status: stage,
        old_status: previousStage,
        new_status: stage,
        changed_by: identity.userId,
        created_at: occurredAt,
      })
      .select("id,lead_id,old_status,new_status,changed_by,created_at")
      .single();

    if (historyError || !history) {
      const rollback = await admin
        .from("leads")
        .update({ status: current.status })
        .eq("id", leadId)
        .eq("organization_id", identity.organizationId)
        .eq("status", stage);
      logger.error("pipeline.history_failed", { leadId, stage, previousStage, rollbackError: rollback.error?.message, historyError: historyError?.message });
      return NextResponse.json({ error: "A movimentação não foi registrada e foi desfeita para proteger o histórico.", code: "PIPELINE_AUDIT_FAILED" }, { status: 503 });
    }

    await Promise.allSettled([
      recordLiveLeadEvent(admin, {
        organizationId: identity.organizationId,
        leadId,
        actorId: identity.userId,
        type: reversalOf ? "pipeline_move_reverted" : "pipeline_stage_changed",
        title: reversalOf ? "Movimentação desfeita" : "Etapa comercial atualizada",
        description: followUpDescription || `${previousStage} → ${stage}`,
        metadata: {
          fromStage: previousStage,
          toStage: stage,
          pipelineHistoryId: history.id,
          reversalOf,
          source,
          humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null,
        },
      }),
    ]);

    const data = mapLegacyLead(updated as unknown as Record<string, unknown>);
    await Promise.allSettled([recordFunnelLearning({ organizationId: identity.organizationId, leadId, previousStage, stage, occurredAt, description: followUpDescription })]);

    logger.info("pipeline.stage_changed", {
      leadId,
      previousStage,
      stage,
      organizationId: identity.organizationId,
      source,
      humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null,
    });
    return NextResponse.json({
      lead: data,
      move: {
        moveId: history.id,
        fromStage: previousStage,
        toStage: stage,
        occurredAt,
        reversalOf,
        source,
        humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null,
        auditSource: "pipeline_history",
        writeSafety: "compensating-write",
      },
    });
  } catch (error) {
    logger.warn("pipeline.move_failed", { error: error instanceof Error ? error.message : String(error) });
    return authError(error);
  }
}
