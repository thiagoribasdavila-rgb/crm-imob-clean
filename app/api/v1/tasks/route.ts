import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { buildTaskCenter } from "@/lib/analytics/task-center";
import { LIVE_PROFILE_SELECT, mapLegacyProfile, mapLegacyTask, type CompatRow } from "@/lib/compat/legacy-v2";
import { recordLiveLeadEvent } from "@/lib/compat/live-writes";
import { readCompatibleLeads, readCompatibleTasks } from "@/lib/atlas/core-v2/live-repositories";
import { requestFingerprint } from "@/lib/security/abuse-protection";
import {
  buildCommercialOutcomeContextPreview,
  sameCommercialOutcomeContextPreview,
} from "@/lib/atlas/commercial-outcome-context-preview";

export const dynamic = "force-dynamic";
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
const completedTaskStatuses = new Set(["done", "concluido", "concluida", "completed"]);
const taskOutcomeLabels = {
  contacted: "Contato realizado",
  no_response: "Cliente não respondeu",
  meeting_scheduled: "Visita ou reunião agendada",
  proposal_sent: "Proposta enviada",
  follow_up_needed: "Novo acompanhamento necessário",
  not_interested: "Sem interesse neste momento",
  other: "Outro resultado observado",
} as const;
type TaskOutcome = keyof typeof taskOutcomeLabels;
const normalizeTaskStatus = (value: unknown) => String(value ?? "").trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const validIdempotencyKey = (value: string | null) => Boolean(value && /^[A-Za-z0-9._:-]{8,128}$/.test(value));
const normalizeTaskOutcome = (value: unknown): TaskOutcome | null => {
  const outcome = String(value ?? "").trim() as TaskOutcome;
  return Object.prototype.hasOwnProperty.call(taskOutcomeLabels, outcome) ? outcome : null;
};
const normalizeOutcomeNote = (value: unknown) => String(value ?? "")
  .replace(/[\u0000-\u001F\u007F]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 500);
const normalizeTaskDueAt = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};
const sameTaskDueAt = (left: unknown, right: unknown) => normalizeTaskDueAt(left) === normalizeTaskDueAt(right);

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 90, scope: "task-center-read" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  const organizationId = identity.access.organization.id;
  const [tasks, profiles, leads] = await Promise.all([
    readCompatibleTasks(identity.supabase, { organizationId, limit: 2000 }),
    identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true).limit(2000),
    readCompatibleLeads(identity.supabase, { organizationId, limit: 1000 }),
  ]);
  if (!tasks.ok || profiles.error || !leads.ok) return apiError("TASK_CENTER_LOAD_FAILED", "Módulo de tarefas temporariamente indisponível. Tente novamente.", identity.meta, { status: 503 });
  const profileRows = ((profiles.data ?? []) as unknown as CompatRow[]).map(mapLegacyProfile);
  const leadRows = leads.rows;
  const leadMap = new Map(leadRows.map((lead) => [String(lead.id), lead]));
  const taskRows = tasks.rows.map((task) => ({ ...task, lead: task.lead || (task.lead_id ? leadMap.get(String(task.lead_id)) : null) }));
  const center = buildTaskCenter(taskRows as never[], profileRows as never[], identity.access.profile.id);
  return apiSuccess({ scope: { organizationId, role: identity.access.profile.commercialRole || identity.access.profile.role, actorId: identity.access.profile.id, hierarchicalRls: true }, ...center, compatibility: tasks.compatibility, creationOptions: { leads: leadRows, assignees: profileRows, defaults: { assigneeId: identity.access.profile.id, priority: "media" } }, generatedAt: new Date().toISOString() }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "task-quick-create" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  const body = await request.json(); const title = String(body.title || "").trim(); const description = String(body.description || "").trim(); const leadId = uuid(body.leadId); const requestedAssignee = uuid(body.assigneeId); const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : null; const priority = ["baixa", "media", "alta"].includes(String(body.priority)) ? String(body.priority) : "media"; const cadence = ["daily", "weekly", "monthly"].includes(String(body.cadence)) ? String(body.cadence) : null; const endsAt = cadence && typeof body.endsAt === "string" ? new Date(body.endsAt) : null; const maxOccurrences = cadence ? Math.round(Number(body.maxOccurrences)) : null; const source = body.source === "atlas-copilot" ? "atlas-copilot" : "manual"; const humanConfirmed = body.humanConfirmed === true;
  if (source === "atlas-copilot" && (!leadId || !humanConfirmed)) return apiError("COPILOT_TASK_CONFIRMATION_REQUIRED", "Revise e confirme a tarefa antes de criá-la pelo Copilot.", identity.meta, { status: 409 });
  if (title.length < 3 || title.length > 120 || description.length > 2000 || !dueAt || !Number.isFinite(dueAt.getTime()) || dueAt.getTime() < Date.now() - 300_000) return apiError("TASK_CREATE_INVALID", "Informe título, prazo futuro e dados válidos.", identity.meta, { status: 400 });
  let assigneeId = requestedAssignee || identity.access.profile.id;
  if (leadId) { const lead = await identity.supabase.from("leads").select("id,assigned_user_id").eq("id", leadId).eq("organization_id", identity.access.organization.id).maybeSingle(); if (lead.error || !lead.data) return apiError("TASK_LEAD_NOT_VISIBLE", "Lead não encontrada no seu escopo.", identity.meta, { status: 404 }); assigneeId = lead.data.assigned_user_id || identity.access.profile.id; }
  const assignee = await identity.supabase.from("profiles").select("id").eq("id", assigneeId).eq("organization_id", identity.access.organization.id).eq("active", true).maybeSingle();
  if (assignee.error || !assignee.data) return apiError("TASK_ASSIGNEE_NOT_VISIBLE", "Responsável não permitido no seu escopo.", identity.meta, { status: 403 });
  void endsAt; void maxOccurrences;
  if (cadence) return apiError("TASK_RECURRENCE_PENDING", "Crie a tarefa simples agora. A recorrência será liberada após homologação do calendário.", identity.meta, { status: 503 });
  const result = await identity.supabase.from("tasks").insert({ organization_id: identity.access.organization.id, title, description: description || null, due_date: dueAt.toISOString(), priority, status: "pendente", lead_id: leadId, user_id: assigneeId }).select("id,title,due_date,priority,status,lead_id,user_id,created_at").single();
  if (result.error) return apiError("TASK_CREATE_FAILED", "Não foi possível criar a tarefa.", identity.meta, { status: 400 });
  let auditRecorded = false;
  if (leadId) {
    const audit = await recordLiveLeadEvent(identity.supabase, {
      organizationId: identity.access.organization.id,
      leadId,
      actorId: identity.access.profile.id,
      type: source === "atlas-copilot" ? "copilot_task_confirmed" : "task_created",
      title: source === "atlas-copilot" ? "Tarefa do Copilot confirmada" : "Tarefa criada",
      description: title,
      metadata: {
        taskId: result.data.id,
        dueAt: dueAt.toISOString(),
        priority,
        source,
        humanConfirmed,
        ownerPreservedFromLead: true,
      },
    });
    auditRecorded = !audit.error;
    if (audit.error) {
      structuredApiLog("warn", "task.audit_record_failed", request, identity.meta, {
        actorId: identity.access.profile.id,
        taskId: result.data.id,
        leadId,
        source,
      });
    }
  }
  structuredApiLog("info", "task.created", request, identity.meta, {
    actorId: identity.access.profile.id,
    taskId: result.data.id,
    leadId,
    source,
    humanConfirmed,
    auditRecorded,
  });
  return apiSuccess({ task: mapLegacyTask(result.data as CompatRow), ownerPreservedFromLead: Boolean(leadId), auditable: Boolean(leadId ? auditRecorded : true), auditRecorded: Boolean(leadId ? auditRecorded : true), auditTrail: leadId ? "lead_events" : "structured_log", compatibility: "live-schema-safe" }, identity.meta, { status: 201, headers: rate.headers });
}

export async function PATCH(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "task-center-write" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  const body = await request.json();
  const id = uuid(body.id);
  const action = String(body.action || "");
  const source = body.source === "atlas-copilot" ? "atlas-copilot" : "manual";
  const humanConfirmed = body.humanConfirmed === true;
  const expectedStatus = typeof body.expectedStatus === "string" ? body.expectedStatus.trim() : "";
  const hasExpectedDueAt = Object.prototype.hasOwnProperty.call(body, "expectedDueAt");
  const expectedDueAt = hasExpectedDueAt ? normalizeTaskDueAt(body.expectedDueAt) : undefined;
  const requestedDueAt = normalizeTaskDueAt(body.dueAt);
  const outcome = normalizeTaskOutcome(body.outcome);
  const outcomeNote = normalizeOutcomeNote(body.outcomeNote);
  const commercialContextReviewed = body.commercialContextReviewed === true;
  const expectedCommercialContextInput = body.expectedCommercialContext;
  const hasExpectedCommercialContext = Boolean(
    expectedCommercialContextInput
    && typeof expectedCommercialContextInput === "object"
    && !Array.isArray(expectedCommercialContextInput)
    && Object.prototype.hasOwnProperty.call(expectedCommercialContextInput, "projectName")
    && Object.prototype.hasOwnProperty.call(expectedCommercialContextInput, "sourceName"),
  );
  const expectedCommercialContextPreview = buildCommercialOutcomeContextPreview(
    hasExpectedCommercialContext
      ? expectedCommercialContextInput as Record<string, unknown>
      : {},
  );
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || null;
  if (!id || !["complete", "postpone_one_day", "reschedule", "record_outcome"].includes(action)) return apiError("TASK_ACTION_INVALID", "Ação de tarefa inválida.", identity.meta, { status: 400 });
  if (source === "atlas-copilot" && !["complete", "reschedule", "record_outcome"].includes(action)) return apiError("COPILOT_TASK_ACTION_NOT_ALLOWED", "O Copilot só pode preparar a conclusão, o reagendamento ou o registro confirmado do resultado desta tarefa.", identity.meta, { status: 403 });
  if (source === "atlas-copilot" && action === "complete" && (!humanConfirmed || !expectedStatus)) return apiError("COPILOT_TASK_COMPLETION_CONFIRMATION_REQUIRED", "Revise e confirme o estado atual antes de concluir a tarefa.", identity.meta, { status: 409 });
  if (source === "atlas-copilot" && action === "reschedule" && (!humanConfirmed || !expectedStatus)) return apiError("COPILOT_TASK_RESCHEDULE_CONFIRMATION_REQUIRED", "Revise o novo prazo e confirme antes de reagendar a tarefa.", identity.meta, { status: 409 });
  if (source === "atlas-copilot" && action === "record_outcome" && (!humanConfirmed || !expectedStatus || !outcome || !commercialContextReviewed || !hasExpectedCommercialContext)) return apiError("COPILOT_TASK_OUTCOME_CONFIRMATION_REQUIRED", "Revise o resultado, o projeto e a origem disponíveis antes de registrá-los na memória comercial.", identity.meta, { status: 409 });
  if (action === "record_outcome" && source !== "atlas-copilot") return apiError("TASK_OUTCOME_SOURCE_INVALID", "Registre o resultado pelo fluxo governado do Copilot.", identity.meta, { status: 403 });
  if (source === "atlas-copilot" && !validIdempotencyKey(idempotencyKey)) return apiError("COPILOT_TASK_IDEMPOTENCY_REQUIRED", "Atualize a fila e confirme novamente esta alteração.", identity.meta, { status: 400 });
  if (action === "reschedule" && (!requestedDueAt || new Date(requestedDueAt).getTime() < Date.now() - 300_000)) return apiError("TASK_RESCHEDULE_INVALID", "Escolha um novo prazo futuro válido.", identity.meta, { status: 400 });
  if (source === "atlas-copilot" && action === "reschedule" && (!hasExpectedDueAt || expectedDueAt === undefined)) return apiError("COPILOT_TASK_DUE_DATE_REQUIRED", "Atualize a fila e revise o prazo atual antes de reagendar.", identity.meta, { status: 409 });

  const organizationId = identity.access.organization.id;
  const current = await identity.supabase.from("tasks").select("id,title,due_date,status,lead_id,user_id,created_at").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (current.error || !current.data) return apiError("TASK_NOT_FOUND", "Tarefa não encontrada no seu escopo.", identity.meta, { status: 404 });
  const currentStatus = normalizeTaskStatus(current.data.status);
  const expectedNormalized = normalizeTaskStatus(expectedStatus);
  const idempotencyFingerprint = idempotencyKey ? requestFingerprint({ organizationId, id, action, source, humanConfirmed, expectedStatus, expectedDueAt, requestedDueAt, outcome, outcomeNote, commercialContextReviewed, expectedCommercialContext: expectedCommercialContextPreview, idempotencyKey }) : null;

  if (action === "complete" && completedTaskStatuses.has(currentStatus)) {
    structuredApiLog("info", "task.completion_idempotent_replay", request, identity.meta, {
      actorId: identity.access.profile.id,
      taskId: id,
      source,
      idempotencyFingerprint,
    });
    return apiSuccess({
      task: mapLegacyTask(current.data as CompatRow),
      action,
      transitionApplied: false,
      alreadyCompleted: true,
      idempotentReplay: true,
      auditRecorded: true,
      auditTrail: current.data.lead_id ? "lead_events-existing-transition" : "structured_log-existing-transition",
    }, identity.meta, { headers: rate.headers });
  }

  if (action === "reschedule" && completedTaskStatuses.has(currentStatus)) return apiError(
    "TASK_ALREADY_COMPLETED",
    "A tarefa já foi concluída e não pode ser reagendada.",
    identity.meta,
    { status: 409, details: { currentStatus: current.data.status }, headers: rate.headers },
  );

  if (source === "atlas-copilot" && expectedNormalized !== currentStatus) return apiError(
    "TASK_STATUS_CONFLICT",
    "A tarefa mudou desde a sua revisão. Atualize a fila antes de confirmar.",
    identity.meta,
    { status: 409, details: { currentStatus: current.data.status }, headers: rate.headers },
  );

  if (action === "record_outcome") {
    if (!completedTaskStatuses.has(currentStatus)) return apiError(
      "TASK_OUTCOME_REQUIRES_COMPLETION",
      "Conclua a tarefa antes de registrar o resultado observado.",
      identity.meta,
      { status: 409, details: { currentStatus: current.data.status }, headers: rate.headers },
    );
    if (!current.data.lead_id) return apiError(
      "TASK_OUTCOME_REQUIRES_LEAD",
      "Esta tarefa não está vinculada a uma lead e não pode alimentar a memória comercial.",
      identity.meta,
      { status: 409, headers: rate.headers },
    );

    const existingOutcome = await identity.supabase
      .from("lead_events")
      .select("id,lead_id,event_type,type,description,metadata,created_by,created_at")
      .eq("organization_id", organizationId)
      .eq("lead_id", current.data.lead_id)
      .eq("event_type", "copilot_task_outcome_recorded")
      .contains("metadata", { taskId: id, idempotencyFingerprint })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingOutcome.error) {
      structuredApiLog("warn", "task.outcome_idempotency_check_failed", request, identity.meta, {
        actorId: identity.access.profile.id,
        taskId: id,
        leadId: current.data.lead_id,
        idempotencyFingerprint,
      });
      return apiError("TASK_OUTCOME_IDEMPOTENCY_CHECK_FAILED", "Não foi possível confirmar se este resultado já foi registrado. Tente novamente.", identity.meta, { status: 503, headers: rate.headers });
    }
    if (existingOutcome.data) {
      structuredApiLog("info", "task.outcome_idempotent_replay", request, identity.meta, {
        actorId: identity.access.profile.id,
        taskId: id,
        leadId: current.data.lead_id,
        outcome,
        idempotencyFingerprint,
      });
      return apiSuccess({
        task: mapLegacyTask(current.data as CompatRow),
        action,
        outcomeRecord: existingOutcome.data,
        outcomeRecorded: false,
        alreadyRecorded: true,
        idempotentReplay: true,
        auditRecorded: true,
        auditTrail: "lead_events-existing-outcome",
        outcomeContextPreview: expectedCommercialContextPreview,
      }, identity.meta, { headers: rate.headers });
    }

    const leadContextSnapshot = await identity.supabase
      .from("leads")
      .select("id,project,source")
      .eq("id", current.data.lead_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (leadContextSnapshot.error || !leadContextSnapshot.data) {
      structuredApiLog("warn", "task.outcome_context_snapshot_failed", request, identity.meta, {
        actorId: identity.access.profile.id,
        taskId: id,
        leadId: current.data.lead_id,
        idempotencyFingerprint,
      });
      return apiError(
        "TASK_OUTCOME_CONTEXT_SNAPSHOT_FAILED",
        "O contexto comercial não pôde ser confirmado agora. O resultado ainda não foi gravado; tente novamente.",
        identity.meta,
        { status: 503, headers: rate.headers },
      );
    }
    const commercialContextCapturedAt = new Date().toISOString();
    const currentCommercialContextPreview = buildCommercialOutcomeContextPreview({
      projectName: leadContextSnapshot.data.project,
      sourceName: leadContextSnapshot.data.source,
    });
    if (!sameCommercialOutcomeContextPreview(expectedCommercialContextPreview, currentCommercialContextPreview)) {
      structuredApiLog("info", "task.outcome_context_changed_since_review", request, identity.meta, {
        actorId: identity.access.profile.id,
        taskId: id,
        leadId: current.data.lead_id,
        idempotencyFingerprint,
      });
      return apiError(
        "TASK_OUTCOME_CONTEXT_CONFLICT",
        "O projeto ou a origem mudou desde a sua revisão. Confira o contexto atualizado e confirme novamente.",
        identity.meta,
        {
          status: 409,
          details: {
            currentStatus: current.data.status,
            commercialContextPreview: currentCommercialContextPreview,
          },
          headers: rate.headers,
        },
      );
    }

    const outcomeRecord = await recordLiveLeadEvent(identity.supabase, {
      organizationId,
      leadId: current.data.lead_id,
      actorId: identity.access.profile.id,
      type: "copilot_task_outcome_recorded",
      title: taskOutcomeLabels[outcome as TaskOutcome],
      description: outcomeNote || null,
      metadata: {
        taskId: id,
        taskStatus: current.data.status,
        outcome,
        source,
        humanConfirmed,
        idempotencyFingerprint,
        commercialContextSnapshot: {
          schemaVersion: 1,
          basis: "lead_at_human_confirmation",
          capturedAt: commercialContextCapturedAt,
          projectName: currentCommercialContextPreview.projectName,
          sourceName: currentCommercialContextPreview.sourceName,
        },
      },
    });
    if (outcomeRecord.error || !outcomeRecord.data) {
      structuredApiLog("warn", "task.outcome_record_failed", request, identity.meta, {
        actorId: identity.access.profile.id,
        taskId: id,
        leadId: current.data.lead_id,
        outcome,
        idempotencyFingerprint,
      });
      return apiError("TASK_OUTCOME_RECORD_FAILED", "O resultado não foi salvo na memória comercial. A tarefa permanece concluída; tente registrar novamente.", identity.meta, { status: 503, headers: rate.headers });
    }
    structuredApiLog("info", "task.outcome_recorded", request, identity.meta, {
      actorId: identity.access.profile.id,
      taskId: id,
      leadId: current.data.lead_id,
      outcome,
      eventId: outcomeRecord.data.id,
      humanConfirmed,
      commercialContextSnapshotCaptured: true,
      idempotencyFingerprint,
    });
    return apiSuccess({
      task: mapLegacyTask(current.data as CompatRow),
      action,
      outcomeRecord: outcomeRecord.data,
      outcomeRecorded: true,
      alreadyRecorded: false,
      idempotentReplay: false,
      auditRecorded: true,
      auditTrail: "lead_events",
      outcomeContextPreview: currentCommercialContextPreview,
    }, identity.meta, { status: 201, headers: rate.headers });
  }

  if (source === "atlas-copilot" && action === "reschedule" && sameTaskDueAt(requestedDueAt, current.data.due_date)) {
    structuredApiLog("info", "task.reschedule_idempotent_replay", request, identity.meta, {
      actorId: identity.access.profile.id,
      taskId: id,
      source,
      resultingDueAt: current.data.due_date,
      idempotencyFingerprint,
    });
    return apiSuccess({
      task: mapLegacyTask(current.data as CompatRow),
      action,
      transitionApplied: false,
      alreadyScheduled: true,
      idempotentReplay: true,
      auditRecorded: true,
      auditTrail: current.data.lead_id ? "lead_events-existing-transition" : "structured_log-existing-transition",
    }, identity.meta, { headers: rate.headers });
  }

  if (source === "atlas-copilot" && action === "reschedule" && !sameTaskDueAt(expectedDueAt, current.data.due_date)) return apiError(
    "TASK_DUE_DATE_CONFLICT",
    "O prazo mudou desde a sua revisão. Atualize a fila antes de confirmar.",
    identity.meta,
    { status: 409, details: { currentStatus: current.data.status, currentDueAt: current.data.due_date }, headers: rate.headers },
  );

  const update = action === "complete"
    ? { status: "concluida" }
    : action === "reschedule"
      ? { due_date: requestedDueAt as string }
      : { due_date: new Date(Math.max(Date.now(), current.data.due_date ? new Date(current.data.due_date).getTime() : 0) + 86_400_000).toISOString() };
  let mutation = identity.supabase.from("tasks").update(update).eq("id", id).eq("organization_id", organizationId);
  if (source === "atlas-copilot") {
    mutation = mutation.eq("status", current.data.status);
    if (action === "reschedule") mutation = current.data.due_date ? mutation.eq("due_date", current.data.due_date) : mutation.is("due_date", null);
  }
  const result = await mutation.select("id,title,status,due_date,lead_id,user_id,created_at").maybeSingle();
  if (result.error) return apiError("TASK_UPDATE_FAILED", "Não foi possível atualizar a tarefa.", identity.meta, { status: 400 });
  if (!result.data) {
    const latest = await identity.supabase.from("tasks").select("id,title,status,due_date,lead_id,user_id,created_at").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (!latest.error && latest.data && action === "complete" && completedTaskStatuses.has(normalizeTaskStatus(latest.data.status))) {
      return apiSuccess({
        task: mapLegacyTask(latest.data as CompatRow),
        action,
        transitionApplied: false,
        alreadyCompleted: true,
        idempotentReplay: true,
        auditRecorded: true,
        auditTrail: latest.data.lead_id ? "lead_events-existing-transition" : "structured_log-existing-transition",
      }, identity.meta, { headers: rate.headers });
    }
    if (!latest.error && latest.data && action === "reschedule" && expectedNormalized === normalizeTaskStatus(latest.data.status) && sameTaskDueAt(requestedDueAt, latest.data.due_date)) {
      return apiSuccess({
        task: mapLegacyTask(latest.data as CompatRow),
        action,
        transitionApplied: false,
        alreadyScheduled: true,
        idempotentReplay: true,
        auditRecorded: true,
        auditTrail: latest.data.lead_id ? "lead_events-existing-transition" : "structured_log-existing-transition",
      }, identity.meta, { headers: rate.headers });
    }
    return apiError("TASK_UPDATE_CONFLICT", "A tarefa mudou durante a confirmação. Atualize a fila e tente novamente.", identity.meta, { status: 409, details: { currentStatus: latest.data?.status ?? null, currentDueAt: latest.data?.due_date ?? null }, headers: rate.headers });
  }

  let auditRecorded = true;
  let auditTrail = "structured_log";
  if (source === "atlas-copilot" && action === "complete" && result.data.lead_id) {
    const audit = await recordLiveLeadEvent(identity.supabase, {
      organizationId,
      leadId: result.data.lead_id,
      actorId: identity.access.profile.id,
      type: "copilot_task_completed",
      title: "Tarefa concluída com confirmação",
      description: result.data.title || "Tarefa comercial",
      metadata: {
        taskId: result.data.id,
        previousStatus: current.data.status,
        resultingStatus: result.data.status,
        dueAt: result.data.due_date,
        ownerId: result.data.user_id,
        source,
        humanConfirmed,
        idempotencyFingerprint,
      },
    });
    auditRecorded = !audit.error;
    auditTrail = auditRecorded ? "lead_events" : "structured_log-fallback";
    if (audit.error) structuredApiLog("warn", "task.completion_audit_fallback", request, identity.meta, { actorId: identity.access.profile.id, taskId: id, leadId: result.data.lead_id, source, idempotencyFingerprint });
  }
  if (source === "atlas-copilot" && action === "reschedule" && result.data.lead_id) {
    const audit = await recordLiveLeadEvent(identity.supabase, {
      organizationId,
      leadId: result.data.lead_id,
      actorId: identity.access.profile.id,
      type: "copilot_task_rescheduled",
      title: "Tarefa reagendada com confirmação",
      description: result.data.title || "Tarefa comercial",
      metadata: {
        taskId: result.data.id,
        previousStatus: current.data.status,
        resultingStatus: result.data.status,
        previousDueAt: current.data.due_date,
        resultingDueAt: result.data.due_date,
        ownerId: result.data.user_id,
        source,
        humanConfirmed,
        idempotencyFingerprint,
      },
    });
    auditRecorded = !audit.error;
    auditTrail = auditRecorded ? "lead_events" : "structured_log-fallback";
    if (audit.error) structuredApiLog("warn", "task.reschedule_audit_fallback", request, identity.meta, { actorId: identity.access.profile.id, taskId: id, leadId: result.data.lead_id, source, idempotencyFingerprint });
  }
  structuredApiLog("info", "task.updated", request, identity.meta, {
    actorId: identity.access.profile.id,
    taskId: id,
    leadId: result.data.lead_id,
    action,
    source,
    humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null,
    previousStatus: current.data.status,
    resultingStatus: result.data.status,
    previousDueAt: current.data.due_date,
    resultingDueAt: result.data.due_date,
    transitionApplied: true,
    auditRecorded,
    idempotencyFingerprint,
  });
  return apiSuccess({ task: mapLegacyTask(result.data as CompatRow), action, transitionApplied: true, alreadyCompleted: false, alreadyScheduled: false, idempotentReplay: false, auditable: true, auditRecorded, auditTrail }, identity.meta, { headers: rate.headers });
}
