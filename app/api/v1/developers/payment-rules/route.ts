import { type NextRequest, NextResponse } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function canManage(commercialRole: string | null, role: string) {
  return (
    commercialRole === "director" ||
    commercialRole === "superintendent" ||
    role === "admin"
  );
}

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const { data, error } = await access.supabase
    .from("developer_payment_flow_rules")
    .select(
      "id,developer_name,version,rule_name,payment_flow,down_payment_percent,installments_count,balloon_payment_notes,financing_notes,valid_from,valid_until,active,created_at",
    )
    .order("developer_name")
    .order("version", { ascending: false });
  if (error)
    return NextResponse.json(
      { error: "Aplique a migração das regras de pagamento." },
      { status: 503 },
    );
  const rows = data ?? [];
  const grouped = rows.reduce((result, rule) => {
    const key = rule.developer_name.trim().toLocaleLowerCase("pt-BR");
    const current = result.get(key) ?? [];
    current.push(rule);
    result.set(key, current);
    return result;
  }, new Map<string, typeof rows>());
  const homologation = Array.from(grouped.values()).map((rules) => ({
    developerName: rules[0]?.developer_name || "",
    versions: rules.length,
    activeVersions: rules.filter((rule) => rule.active).length,
    latestVersion: Math.max(...rules.map((rule) => rule.version)),
    historyPreserved:
      rules.length >= 2 &&
      rules.filter((rule) => rule.active).length === 1 &&
      rules.some((rule) => !rule.active),
  }));
  return NextResponse.json({
    rules: rows,
    homologation,
    canManage: canManage(
      access.access.profile.commercialRole,
      access.access.profile.role,
    ),
  });
}

export async function POST(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (
    !canManage(access.access.profile.commercialRole, access.access.profile.role)
  )
    return NextResponse.json(
      { error: "Somente diretoria e superintendência podem versionar regras." },
      { status: 403 },
    );
  const body = (await request.json()) as Record<string, unknown>;
  const developerName = String(body.developerName || "")
    .trim()
    .slice(0, 160);
  const ruleName = String(body.ruleName || "")
    .trim()
    .slice(0, 160);
  const paymentFlow = String(body.paymentFlow || "")
    .trim()
    .slice(0, 5000);
  if (
    developerName.length < 2 ||
    ruleName.length < 2 ||
    paymentFlow.length < 10
  )
    return NextResponse.json(
      { error: "Informe incorporadora, nome e descrição completa do fluxo." },
      { status: 400 },
    );
  const admin = getSupabaseAdmin();
  const org = access.access.organization.id;
  const numberOrNull = (value: unknown) =>
    value === "" || value === null || value === undefined
      ? null
      : Number(value);
  const downPaymentPercent = numberOrNull(body.downPaymentPercent);
  const installmentsCount = numberOrNull(body.installmentsCount);
  if (
    (downPaymentPercent !== null &&
      (!Number.isFinite(downPaymentPercent) ||
        downPaymentPercent < 0 ||
        downPaymentPercent > 100)) ||
    (installmentsCount !== null &&
      (!Number.isInteger(installmentsCount) ||
        installmentsCount < 0 ||
        installmentsCount > 600))
  )
    return NextResponse.json(
      { error: "Percentual de entrada ou quantidade de parcelas inválido." },
      { status: 400 },
    );
  const validFrom = String(body.validFrom || "") || null;
  const validUntil = String(body.validUntil || "") || null;
  if (validFrom && validUntil && validUntil < validFrom)
    return NextResponse.json(
      { error: "O fim da vigência não pode ser anterior ao início." },
      { status: 400 },
    );
  const { data, error } = await admin.rpc("version_developer_payment_rule", {
    p_organization_id: org,
    p_created_by: access.access.profile.id,
    p_developer_name: developerName,
    p_rule_name: ruleName,
    p_payment_flow: paymentFlow,
    p_down_payment_percent: downPaymentPercent,
    p_installments_count: installmentsCount,
    p_balloon_payment_notes: String(body.balloonPaymentNotes || "")
      .trim()
      .slice(0, 2000),
    p_financing_notes: String(body.financingNotes || "")
      .trim()
      .slice(0, 2000),
    p_valid_from: validFrom,
    p_valid_until: validUntil,
  });
  if (error)
    return NextResponse.json(
      {
        error:
          "Não foi possível salvar a regra. Revise percentuais, parcelas e vigência.",
      },
      { status: 400 },
    );
  return NextResponse.json({ rule: data }, { status: 201 });
}
