import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildMetaLeadCandidate,
  hasMetaOrigin,
  metaLeadSelect,
  type MetaLeadRecord,
} from "@/lib/meta/test-lead-candidate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "meta-test-candidates" });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request, {
    accessRoles: ["admin", "director_decisor", "director"],
  });
  if (!access.ok) return access.response;

  const organizationId = access.access.organization.id;

  try {
    const exactMetaRows = await access.supabase
      .from("leads")
      .select(metaLeadSelect)
      .eq("organization_id", organizationId)
      .eq("source", "Meta Lead Ads")
      .order("created_at", { ascending: false })
      .limit(120);

    if (exactMetaRows.error) throw exactMetaRows.error;

    let rows = (exactMetaRows.data ?? []) as unknown as MetaLeadRecord[];

    if (rows.length < 10) {
      const recentRows = await access.supabase
        .from("leads")
        .select(metaLeadSelect)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(400);

      if (recentRows.error) throw recentRows.error;

      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const row of (recentRows.data ?? []) as unknown as MetaLeadRecord[]) {
        if (hasMetaOrigin(row)) byId.set(row.id, row);
      }
      rows = [...byId.values()];
    }

    const candidates = rows
      .filter(hasMetaOrigin)
      .map(buildMetaLeadCandidate)
      .sort((a, b) => b.readinessPct - a.readinessPct || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 20);

    const summary = {
      consented: candidates.filter((candidate) => candidate.hasConsent).length,
      eligible: candidates.filter((candidate) => candidate.readinessPct >= 85 && candidate.riskLevel !== "alto").length,
      found: candidates.length,
      withIdentifier: candidates.filter((candidate) => candidate.hasEmail || candidate.hasPhone).length,
    };

    return NextResponse.json({
      data: {
        candidates,
        generatedAt: new Date().toISOString(),
        guardrails: [
          "Seleção apenas: não chama Meta API.",
          "Não envia CAPI, não altera campanha e não muda verba.",
          "Não expõe telefone, e-mail, CPF, renda ou documento.",
          "Lead elegível exige origem Meta, identificador e consentimento antes do ensaio oficial.",
        ],
        mode: "lead_candidate_selection_no_delivery",
        summary,
      },
    }, { headers: rate.headers });
  } catch {
    return NextResponse.json({
      error: {
        code: "META_TEST_CANDIDATES_UNAVAILABLE",
        message: "Não foi possível preparar candidatos Meta agora.",
      },
    }, { headers: rate.headers, status: 503 });
  }
}
