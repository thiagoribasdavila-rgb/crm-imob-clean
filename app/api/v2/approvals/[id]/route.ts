import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type DecisionPayload = { decision?: "approved" | "rejected"; reason?: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    const body = (await request.json()) as DecisionPayload;
    if (!body.decision || !["approved", "rejected"].includes(body.decision)) {
      return NextResponse.json({ error: "Decisão inválida." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", identity.userId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (!profile || !["admin", "manager"].includes(profile.role)) {
      return NextResponse.json({ error: "Apenas administradores e gestores podem decidir aprovações." }, { status: 403 });
    }

    const { data: approval, error } = await admin
      .from("approval_requests")
      .select("id,status,entity_type,entity_id,organization_id")
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .single();

    if (error || !approval) return NextResponse.json({ error: "Aprovação não encontrada." }, { status: 404 });
    if (approval.status !== "pending") return NextResponse.json({ error: "Aprovação já decidida." }, { status: 409 });

    const decidedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("approval_requests")
      .update({ status: body.decision, decision_reason: body.reason ?? null, decided_by: identity.userId, decided_at: decidedAt })
      .eq("id", id);
    if (updateError) throw updateError;

    if (body.decision === "approved" && approval.entity_type === "message" && approval.entity_id) {
      const { data: message } = await admin.from("messages").select("channel").eq("id", approval.entity_id).single();
      const { error: outboxError } = await admin.from("integration_outbox").insert({
        organization_id: identity.organizationId,
        topic: "message.send",
        aggregate_type: "message",
        aggregate_id: approval.entity_id,
        payload: { messageId: approval.entity_id, channel: message?.channel },
      });
      if (outboxError) throw outboxError;
    }

    if (body.decision === "rejected" && approval.entity_type === "message" && approval.entity_id) {
      await admin.from("messages").update({ status: "failed", error: body.reason || "Envio rejeitado na governança." }).eq("id", approval.entity_id);
    }

    logger.info("approval.decided", { approvalId: id, decision: body.decision, userId: identity.userId });
    return NextResponse.json({ id, status: body.decision, decidedAt });
  } catch (error) {
    logger.error("approval.decision_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao decidir aprovação." }, { status: 401 });
  }
}
