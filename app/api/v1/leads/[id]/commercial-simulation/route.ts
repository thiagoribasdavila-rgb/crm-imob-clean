import { type NextRequest, NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const rate = checkRateLimit(clientKey(request, "commercial-simulation"), { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Aguarde antes de criar outra simulação." }, { status: 429 });
  try {
    const identity = await requireApiIdentity(request); const { id } = await context.params; await requireLeadAccess(identity, id);
    const body = await request.json() as { propertyId?: string; action?: "simulate" | "proposal" | "proposal_lifecycle"; simulationId?: string; status?: "sent" | "accepted" | "declined" | "expired"; note?: string };
    if (!body.action || !["simulate", "proposal", "proposal_lifecycle"].includes(body.action)) return NextResponse.json({ error: "Ação de simulação inválida." }, { status: 400 });
    const admin = getSupabaseAdmin();
    if (body.action === "proposal_lifecycle" && body.simulationId && body.status) {
      const { data, error } = await admin.rpc("transition_commercial_proposal", { p_actor_id: identity.userId, p_organization_id: identity.organizationId, p_lead_id: id, p_simulation_id: body.simulationId, p_status: body.status, p_note: String(body.note || "").slice(0, 1000) });
      if (error) return NextResponse.json({ error: "A proposta mudou, venceu ou esta transição não é permitida." }, { status: 409 });
      return NextResponse.json({ proposal: data });
    }
    if (body.action === "proposal" && body.simulationId) {
      const { data, error } = await admin.rpc("request_commercial_proposal_review", { p_actor_id: identity.userId, p_organization_id: identity.organizationId, p_simulation_id: body.simulationId, p_lead_id: id });
      if (error) return NextResponse.json({ error: "Preço, estoque ou regra mudou, a simulação venceu ou já existe revisão pendente. Recalcule antes de continuar." }, { status: 409 });
      return NextResponse.json(data, { status: 202 });
    }
    if (!body.propertyId || !/^[0-9a-f-]{36}$/i.test(body.propertyId)) return NextResponse.json({ error: "Selecione uma unidade válida." }, { status: 400 });
    const { data: property } = await admin.from("properties").select("id,title,price,status,development_id").eq("id", body.propertyId).eq("organization_id", identity.organizationId).single();
    if (!property || !property.development_id || !property.price || !["available", "ativo", "disponivel", "disponível"].includes(String(property.status).toLowerCase())) return NextResponse.json({ error: "A unidade precisa estar disponível, vinculada ao projeto e com preço vigente." }, { status: 409 });
    const { data: development } = await admin.from("developments").select("id,name,developer_name").eq("id", property.development_id).eq("organization_id", identity.organizationId).single();
    if (!development?.developer_name) return NextResponse.json({ error: "Informe a incorporadora do empreendimento." }, { status: 409 });
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const { data: release, error: releaseError } = await admin.from("development_commercial_releases").select("id,version,title,price_table_material_id,sales_mirror_material_id,inventory_import_batch_id,payment_rule_id,valid_from,valid_until,status").eq("organization_id", identity.organizationId).eq("development_id", development.id).eq("status", "active").lte("valid_from", now).or(`valid_until.is.null,valid_until.gt.${now}`).maybeSingle();
    if (releaseError || !release) return NextResponse.json({ error: "Não existe pacote comercial vigente e aprovado pela diretoria para este empreendimento." }, { status: 409 });
    const { data: rule, error: ruleError } = await admin.from("developer_payment_flow_rules").select("id,developer_name,rule_name,version,payment_flow,down_payment_percent,installments_count,balloon_payment_notes,financing_notes,valid_from,valid_until,active").eq("id", release.payment_rule_id).eq("organization_id", identity.organizationId).eq("active", true).or(`valid_from.is.null,valid_from.lte.${today}`).or(`valid_until.is.null,valid_until.gte.${today}`).maybeSingle();
    if (ruleError) return NextResponse.json({ error: "Não foi possível confirmar a regra vigente da incorporadora." }, { status: 409 });
    if (!rule) return NextResponse.json({ error: "Cadastre uma regra de pagamento vigente para esta incorporadora." }, { status: 409 });
    const price = Number(property.price);
    if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "O preço vigente da unidade é inválido." }, { status: 409 });
    const down = rule.down_payment_percent === null ? null : Math.round(price * Number(rule.down_payment_percent)) / 100;
    const balance = down === null ? null : price - down; const count = Number(rule.installments_count || 0) || null; const installment = balance !== null && count ? Math.round(balance / count * 100) / 100 : null;
    const disclaimer = "Simulação preliminar — NÃO É PROPOSTA. Preço, estoque, crédito e condições devem ser reconfirmados antes de qualquer envio ao cliente.";
    const releaseSnapshot = { id: release.id, version: release.version, title: release.title, priceTableMaterialId: release.price_table_material_id, salesMirrorMaterialId: release.sales_mirror_material_id, inventoryImportBatchId: release.inventory_import_batch_id, validFrom: release.valid_from, validUntil: release.valid_until };
    const snapshot = { developerName: rule.developer_name, developmentName: development.name, propertyTitle: property.title, ruleName: rule.rule_name, version: rule.version, commercialReleaseVersion: release.version, releaseSnapshot, paymentFlow: rule.payment_flow, downPaymentPercent: rule.down_payment_percent, balloonPaymentNotes: rule.balloon_payment_notes, financingNotes: rule.financing_notes, ruleValidity: { from: rule.valid_from, until: rule.valid_until }, calculatedAt: new Date().toISOString(), calculation: "Entrada = preço × percentual da regra; saldo = preço − entrada; parcela linear = saldo ÷ quantidade, quando aplicável.", disclaimer };
    const ruleDeadline = rule.valid_until ? new Date(`${rule.valid_until}T23:59:59.999Z`).getTime() : Number.POSITIVE_INFINITY;
    const releaseDeadline = release.valid_until ? new Date(release.valid_until).getTime() : Number.POSITIVE_INFINITY;
    const validUntil = new Date(Math.min(Date.now() + 24 * 60 * 60_000, ruleDeadline, releaseDeadline)).toISOString();
    const { data, error } = await admin.from("commercial_simulations").insert({ organization_id: identity.organizationId, lead_id: id, property_id: property.id, development_id: development.id, payment_rule_id: rule.id, commercial_release_id: release.id, created_by: identity.userId, property_price: price, down_payment: down, financed_balance: balance, installment_amount: installment, installments_count: count, rule_snapshot: snapshot, valid_until: validUntil }).select("id,property_price,down_payment,financed_balance,installment_amount,installments_count,rule_snapshot,status,valid_until").single();
    if (error) return NextResponse.json({ error: "Não foi possível registrar a simulação." }, { status: 400 });
    await admin.from("activities").insert({ organization_id: identity.organizationId, lead_id: id, user_id: identity.userId, type: "commercial_simulation", title: `Simulação criada para ${property.title || "unidade"}`, description: `Regra ${rule.rule_name}, versão ${rule.version}. Valores sujeitos à confirmação.`, metadata: { simulationId: data.id, paymentRuleId: rule.id, requiresHumanApproval: true }, occurred_at: new Date().toISOString() });
    return NextResponse.json({ simulation: data, property: { id: property.id, title: property.title }, disclaimer, safeguards: { isProposal: false, creditApproved: false, inventoryRecheckRequired: true, priceRecheckRequired: true, paymentRuleVersion: rule.version, commercialReleaseVersion: release.version } }, { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : "Falha na simulação."; return NextResponse.json({ error: message }, { status: /sessão|token/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 500 }); }
}
