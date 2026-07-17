import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";
const inventory = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", scope: "public", required: true }, { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", scope: "public", required: true },
  { name: "ATLAS_BASE_URL", scope: "server", required: true }, { name: "SUPABASE_SERVICE_ROLE_KEY", scope: "server", required: true },
  { name: "ATLAS_CRON_SECRET", scope: "server", required: true }, { name: "OPENAI_API_KEY", scope: "server", required: false },
  { name: "PERPLEXITY_API_KEY", scope: "server", required: false }, { name: "META_APP_SECRET", scope: "server", required: false },
  { name: "META_LEAD_ACCESS_TOKEN", scope: "server", required: false }, { name: "META_CONVERSIONS_ACCESS_TOKEN", scope: "server", required: false },
  { name: "META_ADS_ACCESS_TOKEN", scope: "server", required: false }, { name: "WHATSAPP_ACCESS_TOKEN", scope: "server", required: false },
  { name: "GOOGLE_ADS_DEVELOPER_TOKEN", scope: "server", required: false }, { name: "TIKTOK_ADS_ACCESS_TOKEN", scope: "server", required: false },
] as const;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "secrets-governance" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Auditoria de segredos é exclusiva da diretoria.", identity.meta, { status: 403 });
  const variables = inventory.map((item) => ({ name: item.name, scope: item.scope, required: item.required, configured: Boolean(process.env[item.name]) }));
  const invalidPublicNames = inventory.filter((item) => item.scope === "server" && item.name.startsWith("NEXT_PUBLIC_"));
  return apiSuccess({ policy: { valuesReturned: false, allowedPublicVariables: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_APP_URL"], repositoryScanCommand: "npm run security:secrets" }, variables, summary: { requiredReady: variables.filter((item) => item.required).every((item) => item.configured), serverSecretsExposedAsPublic: invalidPublicNames.length, environment: process.env.ATLAS_ENV || "unknown", hosting: process.env.ATLAS_HOSTING_PROVIDER === "hostinger" ? "hostinger" : "unconfirmed" } }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
