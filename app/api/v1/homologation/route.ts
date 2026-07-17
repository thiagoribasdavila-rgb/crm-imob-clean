import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { homologationChecklist } from "@/lib/atlas/homologation-checklist";
import { requireAccessContext } from "@/lib/api/security";
import { aiCalibration } from "@/lib/atlas/ai-calibration";
import { evolutionPhases, overallEvolution, technicalEvolution } from "@/lib/atlas/evolution-phases";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const { data, error } = await access.supabase.from("homologation_results").select("id,check_key,outcome,notes,verified_by,verified_at").order("verified_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Aplique a migração de homologação para iniciar o roteiro." }, { status: 503 });
  return NextResponse.json({ checks: homologationChecklist, results: data ?? [], readiness: { overallEvolution, technicalEvolution, aiCalibration, phases: evolutionPhases }, currentUser: { id: access.access.profile.id, commercialRole: access.access.profile.commercialRole || (access.access.profile.role === "admin" ? "director" : access.access.profile.role) } });
}

export async function POST(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const body = await request.json() as { checkKey?: string; outcome?: string; notes?: string };
  const check = homologationChecklist.find((item) => item.key === body.checkKey);
  const role = access.access.profile.commercialRole || (access.access.profile.role === "admin" ? "director" : access.access.profile.role);
  if (!check || ![check.role, "director"].includes(role)) return NextResponse.json({ error: "Este teste deve ser validado pelo perfil responsável ou supervisionado pela diretoria." }, { status: 403 });
  if (body.outcome !== "passed" && body.outcome !== "failed") return NextResponse.json({ error: "Resultado inválido." }, { status: 400 });
  const { data, error } = await access.supabase.from("homologation_results").upsert({ organization_id: access.access.organization.id, check_key: check.key, outcome: body.outcome, notes: String(body.notes || "").trim().slice(0, 1000) || null, verified_by: access.access.profile.id, verified_at: new Date().toISOString() }, { onConflict: "organization_id,check_key,verified_by" }).select("id,check_key,outcome,notes,verified_by,verified_at").single();
  if (error) return NextResponse.json({ error: "Não foi possível registrar a evidência." }, { status: 400 });
  return NextResponse.json({ result: data });
}
