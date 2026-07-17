import { type NextRequest, NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await requireApiIdentity(request); const { id } = await context.params; await requireLeadAccess(identity, id);
    const body = await request.json() as { propertyId?: string; action?: "simulate" | "proposal"; simulationId?: string };
    const admin = getSupabaseAdmin();
    if (body.action === "proposal" && body.simulationId) {
      const { data: simulation } = await admin.from("commercial_simulations").select("id,lead_id,property_id,valid_until,status").eq("id", body.simulationId).eq("lead_id", id).eq("organization_id", identity.organizationId).single();
      if (!simulation || new Date(simulation.valid_until).getTime() < Date.now()) return NextResponse.json({ error: "Simulação vencida. Recalcule com preço e regra atuais." }, { status: 409 });
      await admin.from("commercial_simulations").update({ status: "proposal_review", updated_at: new Date().toISOString() }).eq("id", simulation.id);
      const { data: approval, error } = await admin.from("approval_requests").insert({ organization_id: identity.organizationId, request_type: "commercial_proposal", entity_type: "commercial_simulation", entity_id: simulation.id, payload: { leadId: id, propertyId: simulation.property_id, requiresInventoryCheck: true, requiresPriceCheck: true, requiresPaymentRuleCheck: true }, requested_by: identity.userId }).select("id").single();
      if (error) return NextResponse.json({ error: "Não foi possível enviar a proposta para revisão." }, { status: 400 });
      return NextResponse.json({ simulationId: simulation.id, approvalId: approval.id, status: "proposal_review" }, { status: 202 });
    }
    if (!body.propertyId || !/^[0-9a-f-]{36}$/i.test(body.propertyId)) return NextResponse.json({ error: "Selecione uma unidade válida." }, { status: 400 });
    const { data: property } = await admin.from("properties").select("id,title,price,status,development_id").eq("id", body.propertyId).eq("organization_id", identity.organizationId).single();
    if (!property || !property.development_id || !property.price || !["available", "ativo", "disponivel", "disponível"].includes(String(property.status).toLowerCase())) return NextResponse.json({ error: "A unidade precisa estar disponível, vinculada ao projeto e com preço vigente." }, { status: 409 });
    const { data: development } = await admin.from("developments").select("id,name,developer_name").eq("id", property.development_id).eq("organization_id", identity.organizationId).single();
    if (!development?.developer_name) return NextResponse.json({ error: "Informe a incorporadora do empreendimento." }, { status: 409 });
    const today = new Date().toISOString().slice(0, 10);
    const { data: rule } = await admin.from("developer_payment_flow_rules").select("*").eq("organization_id", identity.organizationId).ilike("developer_name", development.developer_name).eq("active", true).or(`valid_from.is.null,valid_from.lte.${today}`).or(`valid_until.is.null,valid_until.gte.${today}`).maybeSingle();
    if (!rule) return NextResponse.json({ error: "Cadastre uma regra de pagamento vigente para esta incorporadora." }, { status: 409 });
    const price = Number(property.price); const down = rule.down_payment_percent === null ? null : Math.round(price * Number(rule.down_payment_percent)) / 100;
    const balance = down === null ? null : price - down; const count = Number(rule.installments_count || 0) || null; const installment = balance !== null && count ? Math.round(balance / count * 100) / 100 : null;
    const snapshot = { developerName: rule.developer_name, developmentName: development.name, ruleName: rule.rule_name, version: rule.version, paymentFlow: rule.payment_flow, downPaymentPercent: rule.down_payment_percent, balloonPaymentNotes: rule.balloon_payment_notes, financingNotes: rule.financing_notes, ruleValidity: { from: rule.valid_from, until: rule.valid_until } };
    const { data, error } = await admin.from("commercial_simulations").insert({ organization_id: identity.organizationId, lead_id: id, property_id: property.id, development_id: development.id, payment_rule_id: rule.id, created_by: identity.userId, property_price: price, down_payment: down, financed_balance: balance, installment_amount: installment, installments_count: count, rule_snapshot: snapshot }).select("id,property_price,down_payment,financed_balance,installment_amount,installments_count,rule_snapshot,status,valid_until").single();
    if (error) return NextResponse.json({ error: "Não foi possível registrar a simulação." }, { status: 400 });
    await admin.from("activities").insert({ organization_id: identity.organizationId, lead_id: id, user_id: identity.userId, type: "commercial_simulation", title: `Simulação criada para ${property.title || "unidade"}`, description: `Regra ${rule.rule_name}, versão ${rule.version}. Valores sujeitos à confirmação.`, metadata: { simulationId: data.id, paymentRuleId: rule.id, requiresHumanApproval: true }, occurred_at: new Date().toISOString() });
    return NextResponse.json({ simulation: data, property: { id: property.id, title: property.title }, disclaimer: "Simulação preliminar. Preço, estoque, crédito e condições devem ser reconfirmados antes da proposta." }, { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : "Falha na simulação."; return NextResponse.json({ error: message }, { status: /sessão|token/i.test(message) ? 401 : 500 }); }
}
