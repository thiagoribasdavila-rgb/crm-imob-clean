import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { signWebhookPayload } from "@/lib/security/webhook-signature";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { integrationCatalog } from "@/lib/integrations/catalog";

export const dynamic = "force-dynamic";

const portalProviders = new Set<string>(integrationCatalog.filter((item) => item.group === "portals").map((item) => item.provider));

// Ensaio real do webhook de portais: assina um lead de exemplo com o segredo da
// fonte cadastrada, entrega duas vezes (comprova deduplicação), dispara o worker
// e verifica que o lead foi criado com a atribuição preservada. Exclusivo da diretoria.
export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 3, windowMs: 60 * 60_000, scope: "portal-webhook-test" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Ensaio real do webhook de portais é exclusivo da diretoria.", identity.meta, { status: 403 });

  const body = await request.json().catch(() => null) as { provider?: string; externalAccountId?: string } | null;
  const provider = String(body?.provider || "").trim();
  const externalAccountId = String(body?.externalAccountId || "").trim();
  if (!portalProviders.has(provider)) return apiError("INVALID_PORTAL", "Informe um provedor de portal válido do catálogo.", identity.meta, { status: 400 });
  if (!externalAccountId) return apiError("INVALID_PORTAL_ACCOUNT", "Informe o external_account_id da fonte cadastrada.", identity.meta, { status: 400 });

  const cronSecret = process.env.ATLAS_CRON_SECRET; const baseUrl = (process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
  if (!cronSecret || !/^https:\/\//i.test(baseUrl)) return apiError("PORTAL_TEST_NOT_READY", "Configure o worker (ATLAS_CRON_SECRET) e a URL HTTPS da Hostinger.", identity.meta, { status: 503 });

  const admin = getSupabaseAdmin();
  const { data: source } = await admin.from("portal_lead_sources").select("id,organization_id,secret,name").eq("organization_id", identity.access.organization.id).eq("provider", provider).eq("external_account_id", externalAccountId).eq("active", true).maybeSingle();
  if (!source) return apiError("PORTAL_SOURCE_NOT_FOUND", "Cadastre esta conta de portal antes do ensaio.", identity.meta, { status: 400 });

  const externalLeadId = `portal-test-${crypto.randomUUID()}`;
  const listingId = "AP-TESTE-123";
  const payload = JSON.stringify({ leadId: externalLeadId, name: "Lead de Teste", email: "teste@exemplo.com", ddd: "11", phone: "999998888", message: "Tenho interesse neste imóvel.", listing: { id: listingId } });
  const signature = `sha256=${signWebhookPayload(payload, source.secret)}`;

  const deliver = async () => {
    const response = await fetch(`${baseUrl}/api/webhooks/portals/${provider}`, { method: "POST", headers: { "Content-Type": "application/json", "x-atlas-portal-account": externalAccountId, "x-atlas-signature-256": signature }, body: payload, cache: "no-store" });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
    return result;
  };

  try {
    const first = await deliver(); const second = await deliver();
    const workerResponse = await fetch(`${baseUrl}/api/v2/outbox/process`, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` }, cache: "no-store" });
    if (!workerResponse.ok) throw new Error(`Worker HTTP ${workerResponse.status}`);

    const { data: event } = await admin.from("portal_lead_events").select("id,status,lead_id,provider,listing_id").eq("organization_id", source.organization_id).eq("provider", provider).eq("external_lead_id", externalLeadId).single();
    if (!event?.lead_id || event.status !== "imported") throw new Error("Evento ainda não foi importado pelo worker.");

    const { data: leads, count } = await admin.from("leads").select("id,source,phone,metadata", { count: "exact" }).eq("organization_id", source.organization_id).contains("metadata", { portal: { externalLeadId } });
    const lead = leads?.[0]; const metadata = lead?.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {}; const portal = metadata.portal && typeof metadata.portal === "object" ? metadata.portal as Record<string, unknown> : {};
    const attributionPreserved = portal.externalLeadId === externalLeadId && portal.provider === provider && portal.listingId === listingId;
    const phoneNormalized = lead?.phone === "11999998888";
    if (count !== 1 || !attributionPreserved || !phoneNormalized) throw new Error("Deduplicação, atribuição ou normalização de telefone não conferiu.");

    return apiSuccess({ status: "passed", signatureVerified: second.duplicate === true, firstDelivery: first, duplicateDelivery: second, eventId: event.id, leadId: lead.id, leadCount: count, attribution: { externalLeadId: portal.externalLeadId, provider: portal.provider, listingId: portal.listingId }, attributionPreserved, phoneNormalized, testedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });
  } catch (error) {
    return apiError("PORTAL_WEBHOOK_TEST_FAILED", "O ensaio não comprovou assinatura, deduplicação e atribuição. Consulte os logs seguros.", identity.meta, { status: 502, details: error instanceof Error ? error.message.slice(0, 160) : "Falha" });
  }
}
