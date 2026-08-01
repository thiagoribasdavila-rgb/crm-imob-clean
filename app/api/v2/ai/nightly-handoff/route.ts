import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { morningHandoff, nightlyWindow } from "@/lib/ai/governed-nightly-copilot";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.ATLAS_CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.ATLAS_CRON_SECRET}`) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const window = nightlyWindow();
  if (!window.morningHandoff) return NextResponse.json({ created: 0, reason: "Handoff disponível entre 7h e 11h59 em São Paulo." });
  const admin = getSupabaseAdmin();
  const { data: journeys } = await admin.from("ai_sales_journeys").select("id,organization_id,lead_id,broker_id,stage,status,last_message_id,updated_at").eq("morning_handoff_required", true).in("status", ["pending_approval", "active", "waiting_customer", "waiting_broker", "paused"]).limit(500);
  let created = 0;
  for (const journey of journeys ?? []) {
    const [{ data: qualification }, { data: simulation }, { data: existing }] = await Promise.all([
      admin.from("lead_qualification_profiles").select("answered_count").eq("organization_id", journey.organization_id).eq("lead_id", journey.lead_id).maybeSingle(),
      admin.from("commercial_simulations").select("id").eq("organization_id", journey.organization_id).eq("lead_id", journey.lead_id).gt("valid_until", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("nightly_broker_handoffs").select("id").eq("journey_id", journey.id).eq("status", "pending").maybeSingle(),
    ]);
    if (existing) continue;
    const summary = morningHandoff({ stage: journey.stage, status: journey.status, qualificationPercent: Math.round(Number(qualification?.answered_count || 0) / 8 * 100), hasSimulation: Boolean(simulation), lastActivityAt: journey.updated_at });
    const priority = journey.status === "waiting_broker" ? "urgent" : summary.qualificationPercent >= 75 ? "high" : "normal";
    const { error } = await admin.from("nightly_broker_handoffs").insert({ organization_id: journey.organization_id, journey_id: journey.id, lead_id: journey.lead_id, broker_id: journey.broker_id, summary_snapshot: summary, priority });
    if (!error) created += 1;
  }
  // Contrato auditável: messagesSent:false e proposalsCreated:false.
  return NextResponse.json({ created, window: "07:00–11:59 America/Sao_Paulo", messagesSent: false, proposalsCreated: false });
}
