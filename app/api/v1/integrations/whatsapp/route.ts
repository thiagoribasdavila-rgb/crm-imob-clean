import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiIdentity(request);
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
    if (!phoneNumberId || !accessToken) return NextResponse.json({ connected: false, reason: "credentials_missing" });
    const fields = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,throughput,code_verification_status,platform_type";
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) return NextResponse.json({ connected: false, reason: "graph_error", error: typeof data.error === "object" && data.error ? (data.error as { message?: unknown }).message : `HTTP ${response.status}` }, { status: 502 });
    return NextResponse.json({ connected: true, phone: { id: phoneNumberId, displayNumber: data.display_phone_number, verifiedName: data.verified_name, qualityRating: data.quality_rating, messagingLimitTier: data.messaging_limit_tier, throughput: data.throughput, verificationStatus: data.code_verification_status, platformType: data.platform_type }, safeguards: { officialTemplates: true, optOutBeforeSend: true, gradualPacing: true, atomicWorkerClaim: true, webhookHealth: true }, checkedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar WhatsApp." }, { status: 401 });
  }
}
